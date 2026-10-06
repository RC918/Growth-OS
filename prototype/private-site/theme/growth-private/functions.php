<?php
// Theme-only rendering; does not create pages, users, options, grants or activate publication.
add_action('after_setup_theme', function () { remove_theme_support('title-tag'); });
remove_action('wp_head', 'print_emoji_detection_script', 7);
remove_action('wp_print_styles', 'print_emoji_styles');
add_action('wp_enqueue_scripts', function () {
    wp_dequeue_style('wp-block-library'); wp_dequeue_style('global-styles'); wp_dequeue_style('classic-theme-styles');
}, 100);
function growth_candidate_sections($sections) {
    if (!is_array($sections)) return;
    echo '<div class="sections">';
    foreach ($sections as $section) {
        echo '<section class="section"><h2>' . esc_html($section['heading']) . '</h2>';
        foreach ($section['blocks'] as $block) {
            if (isset($block['paragraph'])) echo '<p>' . esc_html($block['paragraph']) . '</p>';
            elseif (isset($block['list'])) { echo '<ul>'; foreach ($block['list'] as $line) echo '<li>' . esc_html($line) . '</li>'; echo '</ul>'; }
        }
        echo '</section>';
    }
    echo '</div>';
}
