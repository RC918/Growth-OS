<?php
// Undeployed single-site candidate; options must be provisioned server-side after approval.
// No installer, default activation or credential issuance. Dedicated user requires growth_run_user.
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
// A site administrator can bypass plugins: an exclusive target editing window is required.
add_filter('map_meta_cap', function ($caps, $cap, $uid, $args) {
    if (get_user_meta($uid, 'growth_run_user', true) && in_array($cap, ['edit_post','delete_post','read_post'], true)) {
        if ((int)($args[0] ?? 0) !== (int)get_option('growth_target') || $cap === 'delete_post') return ['do_not_allow'];
    }
    return $caps;
}, 10, 4);
add_filter('rest_pre_dispatch', function ($result, $server, $r) {
    $uid = get_current_user_id();
    if (!get_user_meta($uid, 'growth_run_user', true)) return $result;
    if (time() >= (int)get_option('growth_read_expires')) return new WP_Error('lease_expired', 'Read lease expired', ['status'=>403]);
    $route = '/wp/v2/pages/' . get_option('growth_target');
    if ($r->get_route() !== $route || !in_array($r->get_method(), ['GET','POST'], true)) return new WP_Error('scope', 'Target denied', ['status'=>403]);
    if ($r->get_method() === 'POST') {
        if (time() >= (int)get_option('growth_expires')) return new WP_Error('lease_expired', 'Write lease expired', ['status'=>403]);
        $body = $r->get_json_params(); $keys = array_keys($body ?? []); sort($keys);
        if ($keys !== ['content','meta','title'] || array_keys($body['meta'] ?? []) !== ['growth_meta_description']) return new WP_Error('fields', 'Fields denied', ['status'=>403]);
        if (!hash_equals(growth_page_revision((int)get_option('growth_target')), $r->get_header('x_growth_before'))) return new WP_Error('changed', 'Page changed', ['status'=>409]);
        // Atomic lifetime attempt ceiling; never reset automatically or on grant renewal.
        // Consumed before WordPress writes: failure/unknown does not free the attempt.
        global $wpdb;
        $taken=$wpdb->query("UPDATE {$wpdb->options} SET option_value=CAST(option_value AS UNSIGNED)+1 WHERE option_name='growth_pilot_attempts' AND option_value IN ('0','1')");
        if ($taken !== 1) return new WP_Error('attempts', 'Pilot attempts closed', ['status'=>403]);
        wp_cache_delete('growth_pilot_attempts','options');
    }
    return $result;
}, 10, 3);

add_filter('authenticate', function ($user) {
    if ($user instanceof WP_User && get_user_meta($user->ID,'growth_run_user',true) && (!defined('REST_REQUEST') || !REST_REQUEST)) return new WP_Error('scope','Dedicated publisher is REST-only');
    return $user;
}, 100, 1);
