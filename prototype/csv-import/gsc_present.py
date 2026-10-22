"""Presentation contract for stored GSC daily readback.

Turns a tenant-scoped readback (see gsc_store.get_gsc_import) into the same
bounded interpretation the baseline report uses: observed totals only,
missing dates stay unknown, no causal attribution, and no claim that the
caller-supplied property or export was verified by Google. Pure function of
the readback dict; performs no storage or network work.
"""
from __future__ import annotations

SEARCH_TYPE_LABELS = {"web": "網頁搜尋", "image": "圖片搜尋", "video": "影片搜尋", "news": "新聞搜尋"}


def present_gsc(readback: dict) -> dict:
    """Bounded presentation model for one stored GSC period."""
    rows = readback["rows"]
    missing = readback["missing_dates"]
    complete = readback["coverage_complete"]
    if complete:
        assessment = {
            "label": "可觀察完整期間，不能歸因",
            "detail": "本段資料完整，可描述點擊與曝光觀察值；不能據此判定措施有效。",
            "next_step": "加入同網站、同搜尋類型、同日數且不重疊的後續期間再比較。",
        }
    else:
        assessment = {
            "label": "先補齊資料",
            "detail": f"本段期間缺少 {len(missing)} 天，不能代表完整期間。",
            "next_step": "先補齊缺少的每日資料；只有確定沒有點擊與曝光的日期才填零。",
        }
    return {
        "property_origin": readback["property_origin"],
        "search_type": readback["search_type"],
        "search_type_label": SEARCH_TYPE_LABELS.get(readback["search_type"], readback["search_type"]),
        "coverage": {"start": readback["coverage_start"], "end": readback["coverage_end"]},
        "provided_days": len(rows),
        "observed": {
            "clicks": readback["observed_clicks"],
            "impressions": readback["observed_impressions"],
            "ctr": readback["observed_ctr"],
        },
        "missing_dates": missing,
        "coverage_complete": complete,
        "assessment": assessment,
        "unknowns": [
            "網站來源、搜尋類型與匯出時間由提供者聲明，尚未向 Google 核實。",
            "未提供到站訪問、商業轉換或 AI 能見度資料，因此這些成果仍未知。",
            *([f"缺少日期：{'、'.join(missing)}。缺日為未知，加總不能代表完整期間。"] if missing else []),
        ],
        "exported_at": readback["exported_at"],
        "content_sha256": readback["content_sha256"],
    }
