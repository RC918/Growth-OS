<?php
// Disposable WordPress fixture only. Not an external site installation package.
add_action('init', function () {
    register_post_meta('page', 'growth_meta_description', [
        'type' => 'string', 'single' => true, 'show_in_rest' => true,
        'sanitize_callback' => 'sanitize_text_field',
        'auth_callback' => function ($allowed, $key, $id) { return current_user_can('edit_post', $id); }
    ]);
});
add_action('wp_head', function () {
    if (is_page()) echo '<meta name="description" content="' . esc_attr(get_post_meta(get_queried_object_id(), 'growth_meta_description', true)) . '">' . "\n";
});
function growth_page_revision($id) {
    $p = get_post($id);
    return hash('sha256', serialize([$p->to_array(), get_post_meta($id)]));
}
add_action('rest_api_init', function () {
    register_rest_field('page', 'growth_revision', ['get_callback' => function ($p) { return growth_page_revision($p['id']); }]);
});
// Application Passwords alone are NOT page-scoped. Enforce this fixture's short lease,
// exact target and three allowed fields independently of the publishing client.
add_filter('map_meta_cap', function ($caps, $cap, $uid, $args) {
    if (get_user_meta($uid, 'growth_run_user', true) && in_array($cap, ['edit_post','delete_post','read_post'], true)) {
        if ((int)($args[0] ?? 0) !== (int)get_option('growth_target') || $cap === 'delete_post') return ['do_not_allow'];
    }
    return $caps;
}, 10, 4);
add_filter('rest_pre_dispatch', function ($result, $server, $r) {
    $uid = get_current_user_id();
    if (!get_user_meta($uid, 'growth_run_user', true)) return $result;
    if (time() >= (int)get_option('growth_expires')) return new WP_Error('lease_expired', 'Lease expired', ['status'=>403]);
    $route = '/wp/v2/pages/' . get_option('growth_target');
    if ($r->get_route() !== $route || !in_array($r->get_method(), ['GET','POST'], true)) return new WP_Error('scope', 'Target denied', ['status'=>403]);
    if ($r->get_method() === 'POST') {
        $body = $r->get_json_params(); $keys = array_keys($body ?? []); sort($keys);
        if ($keys !== ['content','meta','title'] || array_keys($body['meta'] ?? []) !== ['growth_meta_description']) return new WP_Error('fields', 'Fields denied', ['status'=>403]);
        if (!hash_equals(growth_page_revision((int)get_option('growth_target')), $r->get_header('x_growth_before'))) return new WP_Error('changed', 'Page changed', ['status'=>409]);
    }
    return $result;
}, 10, 3);
