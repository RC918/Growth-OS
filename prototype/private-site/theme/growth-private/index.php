<?php
// Product scope is bound to an explicit operator-provisioned page, slug and kind.
// A single plain description is required; malformed/multiple paragraphs never gain Product markup.
$id = get_queried_object_id(); $post = get_post($id);
$product = is_page() && $post && $id === (int)get_option('growth_product_page_id')
    && $post->post_name === 'growth-os' && get_post_meta($id,'growth_page_kind',true) === 'product'
    && preg_match('/\A<p>[^<]*<\/p>\z/s', $post->post_content);
$name = get_post_meta($id,'growth_product_name',true);
$product = $product && is_string($name) && trim($name) !== '';
?><!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?php echo esc_html($post ? $post->post_title : 'Growth OS'); ?></title>
<?php if ($product): ?><meta property="og:type" content="product"><?php endif; ?>
<meta name="growth-public-ready" content="false">
<style><?php readfile(__DIR__ . '/style.css'); ?></style>
<?php wp_head(); ?></head><body>
<a class="skip" href="#main-content">跳到主要內容</a>
<header><div class="shell top"><a class="brand" href="/growth-os/">Growth OS</a><nav aria-label="主要導覽"><?php foreach (['growth-os'=>'產品介紹','about'=>'關於','privacy'=>'隱私說明'] as $slug=>$label): ?><a href="/<?php echo esc_attr($slug); ?>/"<?php if (is_page($slug)) echo ' aria-current="page"'; ?>><?php echo esc_html($label); ?></a><?php endforeach; ?></nav></div></header>
<main class="shell" id="main-content" tabindex="-1"><p class="status">開發中・內部核稿候選，尚未公開上線。</p>
<?php if ($post && is_page()): ?>
<p class="eyebrow"><?php echo $product ? '從網址到可確認的內容改善' : 'Growth OS · 內部核稿'; ?></p>
<?php if ($product): ?>
<section class="product" itemscope itemtype="https://schema.org/Product"><h1 itemprop="name"><?php echo esc_html($name); ?></h1><article data-page-id="<?php echo (int)$id; ?>"><p itemprop="description"><?php echo esc_html(html_entity_decode(wp_strip_all_tags($post->post_content), ENT_QUOTES | ENT_HTML5, 'UTF-8')); ?></p></article></section>
<?php else: ?><h1><?php echo esc_html($post->post_title); ?></h1><?php endif; ?>
<?php if (is_page('privacy')): ?><p class="readiness">尚未具備公開條件：資料保存／刪除、實際 SMTP／分析／第三方接線、資料流與生效資訊仍待核定。</p><?php endif; ?>
<?php growth_candidate_sections(get_post_meta($id,'growth_sections',true)); ?>
<?php else: ?><h1>頁面不存在</h1><?php endif; ?>
</main><footer><div class="shell"><p>古德茉莉科技股份有限公司 · Good Morning Digital Co., Ltd.</p><a href="mailto:hello@gmdgrowth.com">hello@gmdgrowth.com</a><p>候選網域 gmdgrowth.com · 未知效果不以零代替。</p></div></footer>
<?php wp_footer(); ?></body></html>
