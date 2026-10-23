"""Deterministic startup/failure regressions; no Docker, network or keys."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from edge_runtime_support import EmptyResponse, Evidence, parse_response, wait_for_startup


def response(code=503, body=b'{"code":"TRIAL_NOT_READY"}'):
    return b'HTTP/1.1 ' + str(code).encode() + b' Test\r\nContent-Length: ' + str(len(body)).encode() + b'\r\n\r\n' + body


class RuntimeSupportTests(unittest.TestCase):
    def test_empty_exit_zero_retains_original_failure_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            proof = Evidence(directory)
            result = subprocess.CompletedProcess(['docker'], 0, b'', b'')
            with patch('edge_runtime_support.subprocess.run', return_value=result):
                with self.assertRaises(EmptyResponse):
                    proof.transport(['docker'], 1)
            self.assertEqual(Path(directory, 'transport-001.stdout.bin').read_bytes(), b'')
            self.assertEqual(json.loads(Path(directory, 'transport-001.json').read_text())['returncode'], 0)

    def test_running_startup_eof_then_connection_refused_then_valid(self):
        now = [0.0]
        attempts = []
        outcomes = [EmptyResponse(), subprocess.CalledProcessError(1, ['docker']), parse_response(response())]
        def invoke(timeout):
            attempts.append(timeout)
            value = outcomes.pop(0)
            if isinstance(value, Exception):
                raise value
            return value
        def sleep(duration):
            now[0] += duration
        result = wait_for_startup(invoke, lambda: {'Running': True, 'Restarting': False}, clock=lambda: now[0], sleep=sleep)
        self.assertEqual(result[0], 503)
        self.assertEqual(len(attempts), 3)
        self.assertEqual(now[0], .4)

    def test_dead_runtime_is_terminal_and_state_is_in_error(self):
        with self.assertRaisesRegex(RuntimeError, '"ExitCode": 137'):
            wait_for_startup(lambda _: (_ for _ in ()).throw(EmptyResponse()),
                             lambda: {'Running': False, 'ExitCode': 137, 'OOMKilled': True})

    def test_running_runtime_still_has_fixed_deadline(self):
        now = [0.0]
        def sleep(duration):
            now[0] += duration
        with self.assertRaises(TimeoutError):
            wait_for_startup(lambda _: (_ for _ in ()).throw(EmptyResponse()), lambda: {'Running': True},
                             timeout=.3, clock=lambda: now[0], sleep=sleep)
        self.assertEqual(now[0], .3)

    def test_complete_http_error_is_returned_once_without_polling(self):
        calls = []
        def invoke(timeout):
            calls.append(timeout)
            return parse_response(response(500, b'{"code":"EDGE_BOOT_FAILED"}'))
        result = wait_for_startup(invoke, lambda: self.fail('must not poll an HTTP failure'))
        self.assertEqual((result[0], result[2]), (500, {'code': 'EDGE_BOOT_FAILED'}))
        self.assertEqual(len(calls), 1)

    def test_nonempty_malformed_response_and_invalid_json_are_terminal(self):
        for raw in [b'HTTP/1.1 503 Test\r\n', b'garbage\r\n\r\n{}', response(body=b'broken')]:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                wait_for_startup(lambda _: parse_response(raw), lambda: self.fail('must not retry malformed response'))

    def test_timeout_is_terminal_and_preserves_partial_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            proof = Evidence(directory)
            error = subprocess.TimeoutExpired(['docker'], 1, output=b'HTTP/1.1', stderr=b'test timeout')
            with patch('edge_runtime_support.subprocess.run', side_effect=error):
                with self.assertRaises(subprocess.TimeoutExpired):
                    wait_for_startup(lambda timeout: proof.transport(['docker'], timeout), lambda: self.fail('no timeout retry'))
            self.assertEqual(Path(directory, 'transport-001.stdout.bin').read_bytes(), b'HTTP/1.1')
            self.assertTrue(json.loads(Path(directory, 'transport-001.json').read_text())['timeout'])

    def test_nonzero_exit_records_stderr_and_exit_code(self):
        with tempfile.TemporaryDirectory() as directory:
            proof = Evidence(directory)
            with patch('edge_runtime_support.subprocess.run', return_value=subprocess.CompletedProcess(['docker'], 42, b'', b'failure')):
                with self.assertRaises(subprocess.CalledProcessError):
                    proof.transport(['docker'], 1)
            self.assertEqual(Path(directory, 'transport-001.stderr.bin').read_bytes(), b'failure')
            self.assertEqual(json.loads(Path(directory, 'transport-001.json').read_text())['returncode'], 42)

    def test_chunked_and_plain_bodies_and_truncation(self):
        expected = (503, {'code': 'TRIAL_NOT_READY'})
        plain = parse_response(response())
        self.assertEqual((plain[0], plain[2]), expected)
        body = b'{"code":"TRIAL_NOT_READY"}'
        wire = b'HTTP/1.1 503 Test\r\nTransfer-Encoding: chunked\r\n\r\n' + hex(len(body))[2:].encode() + b'\r\n' + body + b'\r\n0\r\n\r\n'
        chunked = parse_response(wire)
        self.assertEqual((chunked[0], chunked[2]), expected)
        for raw in [response()[:-1], wire[:-5]]:
            with self.assertRaises(ValueError):
                parse_response(raw)

    def test_collection_preserves_dead_state_and_logs_before_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            proof = Evidence(directory)
            state = {'Running': False, 'ExitCode': 137, 'OOMKilled': True}
            replies = [subprocess.CompletedProcess([], 0, json.dumps(state).encode(), b''),
                       subprocess.CompletedProcess([], 0, b'booting', b'worker stopped')]
            with patch('edge_runtime_support.subprocess.run', side_effect=replies) as runner:
                proof.collect('synthetic-runtime')
            self.assertEqual(json.loads(Path(directory, 'container-state.json').read_text()), state)
            self.assertEqual(Path(directory, 'container.stderr').read_bytes(), b'worker stopped')
            self.assertEqual([call.args[0][1] for call in runner.call_args_list], ['inspect', 'logs'])

    def test_failed_collection_remains_explicit_without_masking_original_error(self):
        with tempfile.TemporaryDirectory() as directory:
            proof = Evidence(directory)
            with patch('edge_runtime_support.subprocess.run', side_effect=OSError('synthetic diagnostic error')):
                proof.collect('synthetic-runtime')
            errors = json.loads(Path(directory, 'collection-errors.json').read_text())
            self.assertEqual([error['stage'] for error in errors], ['inspect', 'logs'])


if __name__ == '__main__':
    unittest.main()
