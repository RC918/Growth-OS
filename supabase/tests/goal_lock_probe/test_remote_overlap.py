"""Offline controller protocol checks; no password, psql, TLS or DB connections."""
import datetime as dt
import json
from pathlib import Path
import tempfile
import io
from contextlib import redirect_stdout
import unittest
from unittest.mock import patch
import remote_overlap as probe


class ControllerTests(unittest.TestCase):
    def simulate(self, mode='success'):
        events = []
        created = []
        class Fake:
            def __init__(self, label, env, sessions):
                self.label = label
                self.pid = {'A': 10, 'B': 11, 'C': 12}[label]
                self.closed = False
                self.process = self
                sessions.append(self)
                created.append(self)
                if mode == 'auth_failure' and label == 'B':
                    raise RuntimeError('synthetic authentication failure')
                if mode == 'timeout' and label == 'B':
                    raise TimeoutError('synthetic authentication timeout')
                if mode == 'duplicate_pid':
                    self.pid = 10
            def command(self, sql):
                events.append((self.label, sql))
                if sql == probe.APPEND:
                    return '{"version_number":14}'
                if sql == probe.OBSERVE:
                    return json.dumps([{'pid':11,'wait_event_type':'Lock',
                        'blockers':[99] if mode == 'wrong_blocker' else [10],
                        'observed_at':'synthetic'}] if mode != 'no_lock' else [])
                if mode == 'rollback_failure' and sql == 'rollback;' and self.label == 'A':
                    raise RuntimeError('synthetic rollback failure')
                return ''
            def send(self, sql):
                events.append((self.label, 'pending ' + sql))
            def receive(self):
                if ('A', 'rollback;') not in events:
                    raise AssertionError('B returned before A rollback')
                events.append((self.label, 'returned after A rollback'))
                return '{"version_number":14}'
            def close(self):
                if mode == 'close_failure' and self.label == 'A':
                    raise RuntimeError('synthetic close failure')
                self.closed = True
            def poll(self):
                return 0 if self.closed else None
        proof = {'overlap_observed': False}
        end = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)
        error = None
        with patch.object(probe.time, 'sleep'), patch.object(probe.time, 'monotonic', side_effect=range(100)):
            try:
                probe.run_session_phase(Fake, {}, proof, end)
            except Exception as failure:
                error = failure
        if mode != 'close_failure':
            self.assertTrue(all(s.closed for s in created))
            self.assertTrue(proof['client_connections_closed'])
        self.assertLessEqual(len(created), 3)
        return proof, events, error

    def test_barrier_and_rollback_order(self):
        proof, events, error = self.simulate()
        self.assertIsNone(error)
        self.assertTrue(proof['overlap_observed'])
        self.assertEqual(proof['pids'], {'A':10,'B':11,'C':12})
        self.assertLess(events.index(('C', probe.OBSERVE)), events.index(('A','rollback;')))
        self.assertLess(events.index(('B','returned after A rollback')), events.index(('B','rollback;')))
        self.assertFalse(any('commit;' in sql for _, sql in events))

    def test_failure_paths_close_all_partial_sessions(self):
        for mode in ['auth_failure','timeout','duplicate_pid','wrong_blocker','no_lock','rollback_failure']:
            with self.subTest(mode=mode):
                proof, _, error = self.simulate(mode)
                self.assertIsNotNone(error)
                self.assertFalse(proof['overlap_observed'])

    def test_exact_window_and_fail_before_session(self):
        now = dt.datetime(2026,10,1,4,tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'window.json'
            for start, end, accepted in [
                ('2026-10-01T03:00:00Z','2026-10-01T05:00:00Z',True),
                ('2026-10-01T05:00:00Z','2026-10-01T07:00:00Z',False),
                ('2026-10-01T01:00:00Z','2026-10-01T03:00:00Z',False),
                ('2026-10-01T03:00:00Z','2026-10-01T06:00:00Z',False),
                ('2026-10-01T02:10:00Z','2026-10-01T04:10:00Z',False)]:
                path.write_text(json.dumps({'start':start,'deadline':end,'approved':True,'project':probe.PROJECT}))
                if accepted:
                    probe.check_window(path, now)
                else:
                    with self.assertRaises(ValueError):
                        probe.check_window(path, now)
            path.write_text(json.dumps({'start':'2026-10-01T03:00:00Z','deadline':'2026-10-01T05:00:00Z'}))
            with self.assertRaises(ValueError):
                probe.check_window(path, now)

    def test_credential_sources_excluded_from_child_environment(self):
        with patch.dict(probe.os.environ, {'PGPASSWORD':'synthetic-forbidden',
                'PGSERVICE':'synthetic-forbidden','OTHER_SECRET':'synthetic-forbidden'}):
            env = probe.environment('/synthetic/empty')
        self.assertFalse(any('synthetic-forbidden' in value for value in env.values()))
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        argv = probe.command_args(probe.ROLE)
        self.assertIn('-W', argv)
        self.assertIn('-X', argv)
        self.assertNotIn('password=', ' '.join(argv))

    def test_evidence_write_failure_does_not_skip_cleanup_path(self):
        proof = {}
        with patch.object(Path, 'write_text', side_effect=PermissionError):
            probe.save_proof(Path('/synthetic/unwritable'), proof)
        self.assertTrue(proof['evidence_write_error'])

    def test_cleanup_cancel_and_exit_failure_require_admin_fallback(self):
        for failure in [KeyboardInterrupt(), OSError()]:
            proof = {'cleanup_exit_code':None}
            with patch.object(probe.subprocess, 'call', side_effect=failure):
                probe.human_cleanup({}, proof)
            self.assertIsNone(proof['cleanup_exit_code'])
            self.assertIn('cleanup_failure_type', proof)
        proof = {'cleanup_exit_code':None}
        with patch.object(probe.subprocess, 'call', return_value=2):
            probe.human_cleanup({}, proof)
        self.assertEqual(proof['cleanup_exit_code'], 2)

    def test_preflight_failure_never_authenticates_and_names_independent_fallback(self):
        output = io.StringIO()
        with patch.object(probe.sys, 'argv', ['probe', '--window', '/synthetic/missing',
                '--output-dir', '/synthetic/output']), \
                patch.object(probe, 'check_window', side_effect=ValueError), \
                patch.object(probe, 'Session') as session, \
                patch.object(probe, 'human_cleanup') as cleanup, redirect_stdout(output):
            self.assertEqual(probe.main(), 1)
        session.assert_not_called()
        cleanup.assert_not_called()
        self.assertIn('emergency_disable.sql', output.getvalue())
        self.assertIn('分三次', output.getvalue())

    def test_close_failure_does_not_claim_all_sessions_closed(self):
        proof, _, _ = self.simulate('close_failure')
        self.assertFalse(proof['client_connections_closed'])
        self.assertTrue(proof['session_close_error'])


if __name__ == '__main__':
    unittest.main()
