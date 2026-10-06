# 三頁 WordPress theme／內容候選（未部署）

本 Core 以 PR25 `b7d2e93e01793d3cb33a6709fbcdacd1892d0006` 為 base，交付三頁垂直成果；父明確允許完整恢復另 slice。沒有 public-ready、網站上線或完整災復宣稱。

## 內容與 rendering

`content.mjs` 從 `docs/pilot-content` 三份核稿草案產生可比對的 `content.json`（含來源 SHA256）。已知營運者、email、候選網域及 AWS/Supabase 新加坡、Zoho 美國資訊依父派工加入；不把資源所在區域當成已啟用訪客資料流。Privacy 保留實際 SMTP／analytics／第三方／保存刪除／權利與生效日期缺口；`public_ready=false`、blockers 清單及可見待核文字不能被測試成功取代。

`growth-private/` 是小型 classic PHP theme（index.php／functions.php／style.css）；沿用綠色淺底、system font、繁中、44px導覽、skip link與可見焦點，無新框架／script／外部字型／商店／會員／表單。

Product markup 必須同時符合：operator設定的 `growth_product_page_id`、實際 page、slug=growth-os、`growth_page_kind=product`、非空 `growth_product_name`、原文單一純文字 `<p>`。Product scope僅涵蓋明確name與description，其他說明、導覽、About／Privacy在外。About／Privacy不輸出Product或og:product。非法body不被強行標為Product；不沿RC全頁／全段落schema，不新增價格／客戶／評分／效益數據。

產品post_content保留既有publisher單一文字段落契約，其他已核說明放 `growth_sections` metadata，不被三欄publisher覆蓋。HTML `<title>` 精確取raw post_title、meta description沿既有site-plugin、article data-page-id固定實際ID，description只作純文字escape展示，避免WordPress typography造成字元變形；發布與恢復均需API/HTML雙讀回。title不自動附加品牌字尾。theme本身不新增pages/users/options/grants，也不啟用任何發布。

尚未提供production installer。未來批准包需固定這三頁的真實IDs／slugs／kind、product name、sections、title/meta/body的hash與theme/plugin版本；真站不得使用test seed、App Password或UUID。使用現有單站最小publisher plugin與gateway精確路徑，不擴範圍。公開網路／DNS／部署／DataAPI／本人登入／保留刪除另批；此theme的no-public-ready提示不是存取控制，私有入口與防火牆仍是前提。

## 隔離驗證

```
node prototype/private-site/theme/content.mjs
node --test prototype/private-site/theme/contract.test.mjs
node prototype/private-site/schema/native-regression.mjs --mode growth-os-private-schema-regression --theme
```

需已安裝既有pinned WP/MariaDB/PG/GoTrue/PostgREST images與Chromium。本機可設 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`。入口拒絕未指定mode；新schema SQL與既有native JWT/ACL測試不變，theme模式才載入theme fixture。原RC runner／凍結hash不改。

`site-fixture.mjs` 只對createSite剛建立且label核對相符的tmpfs WP容器安裝候選內容與theme；無production路由。固定 `rc-source.example` 為記憶體／loopback測試地址，瀏覽器及server authority request必經owned route guard／native adapters，不使用真gmdgrowth.com或hosted backend。scanner保留原product_source/product_api，未加入SSRF例外；actual HTML經既有wiring的Python HTTP adapter取回。

UI流程明確採既有產品頁結果匯出／workspace匯入，再native Save→logout→fresh login→exactreadback→Review；不冒稱本輪測一般opener handoff。publisher走既有Node child host／gateway／WP App Password隔離fixture。影響區域桌機1280／手機390、鍵盤導覽/Save/Review/publish/restore、控制頁SQL+HTML不變、unknown僅GET、publisher重啟與v2後v1歷史、journal backup至新唯讀目錄恢復。

## 完整恢复下一 slice

[recovery-manifest.json](recovery-manifest.json) 是 **NOT_IMPLEMENTED_NOT_RUN** 的精確範圍，不是可執行backup工具。現有backup只涵蓋journal；WPfiles/MariaDB/scannerSQLite缺共同quiescence切點。下一slice先驗停止入口／drain所有writer、同checkpoint清單、全新隔離還原、freshreadback、unknown不重放及秘密／grant不復活，再談hosted應用。不能拿本輪journal恢復作「一次完整備份還原」證據。Supabase業務資料備份只列14表與Authlinkage候選，沒有連真project或匯出資料。

WordPress依據：[classic template files](https://developer.wordpress.org/themes/classic-themes/basics/template-files/)、[wp_head](https://developer.wordpress.org/reference/functions/wp_head/)、[get_post_meta](https://developer.wordpress.org/reference/functions/get_post_meta/)。UX採repo本機skill的keyboard navigation/focus查詢與既有Core UI規範，未產生新design system。
