from groq import Groq
from dotenv import load_dotenv
import os
import json
import re
import ast
from pathlib import Path

import pandas as pd
try:
    from rapidfuzz import fuzz
except Exception:
    fuzz = None

from tools import (
    get_project_details,
    search_projects,
    compare_projects
)

from dataset_state import get_dataset


# =========================================================
# V4 INVESTIGATION DATA — CANONICAL DYNAMIC SOURCE FOR AGENT
# =========================================================

def _get_v4_df():
    """Retrieve the unified, live, scored dataset (CSV + Postgres uploads)."""
    return get_dataset()


def _v4_row(work_id):
    v4_df = _get_v4_df()
    if v4_df.empty or "Work ID" not in v4_df.columns:
        return None
    try:
        wid = int(work_id)
    except Exception:
        return None
    rows = v4_df[v4_df["Work ID"] == wid]
    return None if rows.empty else rows.iloc[0]


def _v4_value(row, *columns):
    """
    Read a V4 value robustly even if the column uses
    different capitalization, spaces, or underscores.
    """
    if row is None:
        return None

    # Exact match first
    for column in columns:
        if column in row.index:
            value = row.get(column)

            if pd.isna(value):
                continue

            if hasattr(value, "item"):
                try:
                    return value.item()
                except Exception:
                    pass

            return value

    # Normalized match: ignores case, spaces, hyphens, and underscores
    def normalize(name):
        return re.sub(r"[^a-z0-9]", "", str(name).lower())

    normalized_columns = {
        normalize(col): col
        for col in row.index
    }

    for column in columns:
        actual_column = normalized_columns.get(normalize(column))

        if actual_column is None:
            continue

        value = row.get(actual_column)

        if pd.isna(value):
            continue

        if hasattr(value, "item"):
            try:
                return value.item()
            except Exception:
                pass

        return value

    return None


def _normalize_reasons(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    text = str(value).strip()
    if " | " in text:
        return [x.strip() for x in text.split(" | ") if x.strip()]
    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass
    return [text] if text else []


def _canonical_project_details(work_id):
    """Authoritative project/risk view. Dynamic live dataset wins whenever Work ID exists."""
    row = _v4_row(work_id)
    if row is None:
        return get_project_details(int(work_id))

    reasons = _normalize_reasons(_v4_value(row, "risk_reasons", "Risk_Reasons", "Risk Reasons"))
    score = _v4_value(row, "risk_score", "Risk_Score", "Risk Score")
    level = _v4_value(row, "risk_level", "Risk_Level", "Risk Level")
    ratio = _v4_value(row, "Amount_Ratio_to_Peer_Median")
    peer_median = _v4_value(row, "peer_median", "Peer_Median")
    peer_count = _v4_value(row, "peer_count", "Peer_Count")

    return {
        "work_id": int(work_id),
        "project": {
            "work_id": int(work_id),
            "description": _v4_value(row, "Work Description"),
            "category": _v4_value(row, "Category"),
            "mp_name": _v4_value(row, "MP Name"),
            "constituency": _v4_value(row, "Constituency"),
            "state": _v4_value(row, "State"),
            "house": _v4_value(row, "House"),
            "final_amount": _v4_value(row, "Final Amount (₹)"),
            "completed_date": _v4_value(row, "Completed Date"),
            "has_images": _v4_value(row, "Has Images"),
        },
        "risk_score": score,
        "risk_level": level,
        "risk_reasons": reasons,
        "peer_median": peer_median,
        "peer_count": peer_count,
        "amount_ratio_to_peer_median": ratio,
    }


def get_financial_trail_v4(work_id):
    row = _v4_row(work_id)
    if row is None:
        return {"error": "Project not found in investigation dataset."}
    return {
        "work_id": int(work_id),
        "recommended_amount": _v4_value(row, "Recommended Amount (₹)"),
        "sanctioned_amount": _v4_value(row, "Sanctioned Amount (₹)"),
        "final_amount": _v4_value(row, "Final Amount (₹)"),
        "total_expenditure": _v4_value(row, "Expenditure_Total"),
        "sanction_minus_recommended": _v4_value(row, "Sanction_minus_Recommended"),
        "expenditure_minus_final": _v4_value(row, "Expenditure_minus_Final"),
        "expenditure_to_final_ratio": _v4_value(row, "Expenditure_to_Final_Ratio"),
        "transaction_count": _v4_value(row, "Transaction_Count"),
        "vendor_count": _v4_value(row, "Vendor_Count"),
        "pending_payment_count": _v4_value(row, "Pending_Payment_Count"),
        "successful_payment_count": _v4_value(row, "Successful_Payment_Count"),
        "last_expenditure_date": _v4_value(row, "Last_Expenditure_Date"),
        "has_expenditure_record": _v4_value(row, "Has_Expenditure_Record"),
        "has_pending_payment": _v4_value(row, "Has_Pending_Payment"),
        "reconciliation": _v4_value(row, "Financial_Reconciliation_Flag"),
    }


def get_project_timeline_v4(work_id):
    row = _v4_row(work_id)
    if row is None:
        return {"error": "Project not found in investigation dataset."}
    return {
        "work_id": int(work_id),
        "recommendation_date": _v4_value(row, "Recommendation Date"),
        "sanction_date": _v4_value(row, "Sanction Date"),
        "completion_date": _v4_value(row, "Completed Date"),
        "recommendation_to_sanction_days": _v4_value(row, "Recommendation_to_Sanction_Days"),
        "sanction_to_completion_days": _v4_value(row, "Sanction_to_Completion_Days"),
        "work_stage": _v4_value(row, "Work Stage"),
        "is_completed": _v4_value(row, "Is Completed"),
        "status": _v4_value(row, "Timeline_Flag"),
    }


def get_mp_context_v4(work_id):
    row = _v4_row(work_id)
    if row is None:
        return {"error": "Project not found in investigation dataset."}
    fields = {
        "mp_name": "MP Name", "constituency": "Constituency", "state": "State", "house": "House",
        "allocated_amount": "MP Allocated Amount (₹)", "total_expenditure": "MP Total Expenditure (₹)",
        "utilization_percent": "MP Utilization %", "completion_rate_percent": "MP Completion Rate %",
        "completed_works": "MP Completed Works", "recommended_works": "MP Recommended Works",
        "pending_payments": "MP Pending Payments", "unpaid_vendor_balance": "MP Unpaid Vendor Balance (₹)",
        "transaction_count": "MP Transaction Count",
    }
    return {"work_id": int(work_id), **{k: _v4_value(row, c) for k, c in fields.items()}}


def compare_financials_v4(work_id):
    return get_financial_trail_v4(work_id)


def _v4_compare_projects(work_id, limit=5):
    """Contextual comparables using the live dynamic dataset and target amount."""
    v4_df = _get_v4_df()
    target = _v4_row(work_id)
    if target is None:
        return {"error": "Project not found in investigation dataset."}

    target_desc = str(_v4_value(target, "Work Description") or "").strip()
    target_state = _v4_value(target, "State")
    target_house = _v4_value(target, "House")
    target_category = _v4_value(target, "Category")
    target_const = _v4_value(target, "Constituency")
    target_amount = _v4_value(target, "Final Amount (₹)")

    if fuzz is None:
        return {"error": "rapidfuzz is required for contextual comparison."}

    candidates = v4_df[
        (v4_df["State"] == target_state) &
        (v4_df["House"] == target_house) &
        (v4_df["Category"] == target_category)
    ].copy()

    results = []

    def quality(text):
        text = str(text or "").strip()
        words = text.split()
        if not text:
            return 0.0
        if len(text) < 25 or len(words) < 5:
            return 0.35
        if len(text) < 60 or len(words) < 10:
            return 0.65
        return 1.0

    tq = quality(target_desc)
    for _, row in candidates.iterrows():
        wid = _v4_value(row, "Work ID")
        if wid is None or int(wid) == int(work_id):
            continue
        desc = str(_v4_value(row, "Work Description") or "").strip()
        if not desc or not target_desc:
            continue
        text_sim = fuzz.token_set_ratio(target_desc.lower(), desc.lower())
        adj = text_sim * min(tq, quality(desc))
        same_const = _v4_value(row, "Constituency") == target_const
        score = adj * 0.60 + 30 + (10 if same_const else 0)
        amount = _v4_value(row, "Final Amount (₹)")
        diff_abs = None
        diff_pct_of_comparable = None
        if amount is not None and target_amount is not None:
            diff_abs = float(target_amount) - float(amount)
            if float(amount) != 0:
                diff_pct_of_comparable = diff_abs / float(amount) * 100
        results.append({
            "work_id": int(wid), "amount": amount, "description": desc,
            "similarity_score": round(score, 2), "text_similarity": round(text_sim, 2),
            "same_state": True, "same_house": True, "same_category": True,
            "same_constituency": same_const, "constituency": _v4_value(row, "Constituency"),
            "state": _v4_value(row, "State"), "house": _v4_value(row, "House"), "category": _v4_value(row, "Category"),
            "target_amount": target_amount, "amount_difference": diff_abs,
            "amount_difference_percent_vs_comparable": diff_pct_of_comparable,
        })

    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    comps = results[:int(limit)]
    return {
        "target_project": {
            "work_id": int(work_id), "amount": target_amount, "description": target_desc,
            "state": target_state, "house": target_house, "category": target_category, "constituency": target_const
        },
        "comparisons": comps
    }


# ---------------------------------------------------------------------------
# V4 ROUTING GUARD — stateless per-request intent + Work ID extraction
# ---------------------------------------------------------------------------
_WORK_ID_RE = re.compile(r"(?i)\b(?:work\s*id|workid|project\s*id|project)\s*[:#-]?\s*(\d{3,})\b")


def _route_query_v4(query: str):
    q = (query or "").strip().lower()
    m = _WORK_ID_RE.search(query or "")
    work_id = int(m.group(1)) if m else None

    if any(k in q for k in (
        "full investigation", "full investigate", "investigate fully",
        "complete investigation", "complete investigate", "overall investigation"
    )):
        intent = "full"
    elif any(k in q for k in (
        "compare", "comparables", "comparable projects", "similar projects",
        "similar project", "peer projects"
    )):
        intent = "compare"
    elif any(k in q for k in (
        "financial", "financials", "expenditure", "payment", "payments",
        "vendor", "vendors", "money", "amount trail", "financial trail"
    )):
        intent = "financial"
    elif any(k in q for k in (
        "timeline", "time line", "dates", "duration", "recommendation date",
        "sanction date", "completion date", "chronology"
    )):
        intent = "timeline"
    elif any(k in q for k in (
        "mp context", "mp-level", "mp level", "allocation", "utilization",
        "utilisation", "completion rate", "recommended works"
    )):
        intent = "mp_context"
    elif any(k in q for k in (
        "risk", "risky", "risk score", "risk level", "risk indicator",
        "risk indicators", "why is", "why was", "flagged", "flag",
        "anomaly", "anomalies", "red flag", "red flags",
        "investigation priority"
    )):
        intent = "risk"
    else:
        intent = "project"

    return work_id, intent


def _extract_work_id(query):
    match = re.search(
        r"(?:work\s*id\s*(?:is|:)?\s*|project\s*(?:id\s*)?(?:is|:)?\s*)?(\d{3,})\b",
        query or "",
        re.I,
    )
    return int(match.group(1)) if match else None


load_dotenv("../.env")

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

SYSTEM_PROMPT = """
SECTION GATING RULE:
Only include a section when its corresponding evidence tool was executed in the current request.
Do not create a Comparative Analysis section for a financial-only request. Do not create Timeline
or MP Context sections unless those tools were called.

CANONICAL DATA RULE:
When a Work ID exists in the dataset, it is authoritative for project amount,
risk score, risk level, risk reasons, lifecycle, financial trail, and MP context.

FINANCIAL INTERPRETATION RULES:
- "Reconciled" means the dataset's reconciliation flag is Reconciled; do not translate this into
  "all funds accounted for" or any broader compliance conclusion.
- Pending payment count means payment records are marked pending/in-progress in the dataset; do not
  infer contractual obligations, vendor non-payment, or misconduct.
- Vendor count and transaction count are descriptive facts only.

STATELESS REQUEST RULE:
Every incoming /agent/investigate request is independent. Never reuse a Work ID,
tool result, selected project, or trace from a previous request.

EXPLICIT WORK ID RULE:
If the user's current query contains an explicit Work ID, that Work ID is
authoritative and must be used for every tool call in this request.

You are the MPLADS AI Investigation Copilot.
Your role is to help investigators analyze public MPLADS project data
and prioritize projects for human verification.
You are NOT a fraud detector. Risk indicators are signals for verification, NOT proof of wrongdoing.
"""

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_project_details",
            "description": "Get structured details, risk score, risk level, and risk indicators for a specific MPLADS project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_id": {"type": "integer", "description": "The MPLADS Work ID of the project."}
                },
                "required": ["work_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_projects",
            "description": "Search MPLADS projects using available filters such as state, risk level, and amount thresholds.",
            "parameters": {
                "type": "object",
                "properties": {
                    "state": {"type": "string", "description": "Indian state to filter projects by."},
                    "risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"], "description": "Risk level."},
                    "min_amount": {"type": "number", "description": "Minimum project amount in rupees."},
                    "max_amount": {"type": "number", "description": "Maximum project amount in rupees."},
                    "has_images": {"type": "boolean", "description": "Filter by image availability."},
                    "limit": {"type": "integer", "description": "Maximum number of projects to return."}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_projects",
            "description": "Compare a specific MPLADS project with similar projects using similarity scores, categories, states, and amounts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_id": {"type": "integer", "description": "The MPLADS Work ID to compare."},
                    "limit": {"type": "integer", "description": "Number of similar projects to compare."}
                },
                "required": ["work_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_financial_trail",
            "description": "Get the financial trail for an MPLADS project including amounts, transactions, and status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_id": {"type": "integer", "description": "The MPLADS Work ID."}
                },
                "required": ["work_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_timeline",
            "description": "Get recommendation, sanction, and completion dates and lifecycle metrics.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_id": {"type": "integer", "description": "The MPLADS Work ID."}
                },
                "required": ["work_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_mp_context",
            "description": "Get MP-level contextual information associated with a project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_id": {"type": "integer", "description": "The MPLADS Work ID."}
                },
                "required": ["work_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_financials",
            "description": "Reconcile project amounts and return reconciliation indicators.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_id": {"type": "integer", "description": "The MPLADS Work ID."}
                },
                "required": ["work_id"]
            }
        }
    }
]

LAST_AGENT_TRACE = []


def reset_agent_trace():
    global LAST_AGENT_TRACE
    LAST_AGENT_TRACE = []


def get_agent_trace():
    return list(LAST_AGENT_TRACE)


def execute_tool(tool_name, arguments):
    LAST_AGENT_TRACE.append({
        "tool": tool_name,
        "status": "executed",
        "arguments": arguments
    })

    if tool_name == "get_project_details":
        return _canonical_project_details(arguments["work_id"])
    if tool_name == "search_projects":
        return search_projects(
            state=arguments.get("state"),
            risk_level=arguments.get("risk_level"),
            min_amount=arguments.get("min_amount"),
            max_amount=arguments.get("max_amount"),
            has_images=arguments.get("has_images"),
            limit=arguments.get("limit", 10)
        )
    if tool_name == "compare_projects":
        return _v4_compare_projects(arguments["work_id"], arguments.get("limit", 5))
    if tool_name == "get_financial_trail":
        return get_financial_trail_v4(arguments["work_id"])
    if tool_name == "get_project_timeline":
        return get_project_timeline_v4(arguments["work_id"])
    if tool_name == "get_mp_context":
        return get_mp_context_v4(arguments["work_id"])
    if tool_name == "compare_financials":
        return compare_financials_v4(arguments["work_id"])
    return {"error": "Unknown tool"}


def _fallback_with_trace(work_id, user_query=""):
    result = _deterministic_fallback(work_id, user_query)
    LAST_AGENT_TRACE.append({
        "tool": "Deterministic evidence synthesis",
        "status": "completed"
    })
    return result


def _deterministic_full_investigation_v4(work_id: int):
    wid = int(work_id)
    project = execute_tool("get_project_details", {"work_id": wid})
    financial = execute_tool("get_financial_trail", {"work_id": wid})
    timeline = execute_tool("get_project_timeline", {"work_id": wid})
    mp = execute_tool("get_mp_context", {"work_id": wid})
    comparison = execute_tool("compare_projects", {"work_id": wid, "limit": 5})

    def money(v):
        try:
            return f"₹{float(v):,.0f}"
        except Exception:
            return "N/A"

    lines = ["### Full Investigation", f"- **Work ID:** {wid}"]

    if isinstance(project, dict):
        proj = project.get("project", {}) if isinstance(project.get("project"), dict) else {}
        lines += [
            f"- **Project:** {proj.get('description', 'N/A')}",
            f"- **Category:** {proj.get('category', 'N/A')}",
            f"- **Location:** {proj.get('state', 'N/A')}, {proj.get('constituency', 'N/A')}",
            f"- **House:** {proj.get('house', 'N/A')}",
            f"- **Risk:** {project.get('risk_level', 'N/A')} ({project.get('risk_score', 'N/A')}/100)",
        ]
        reasons = project.get("risk_reasons", [])
        if isinstance(reasons, str):
            reasons = _normalize_reasons(reasons)
        if reasons:
            lines.append("\n### Risk Indicators")
            for r in reasons:
                lines.append(f"- {r}")

    if isinstance(financial, dict):
        lines.append("\n### Financial Trail")
        for label, keys in [
            ("Recommended amount", ["recommended_amount", "Recommended Amount"]),
            ("Sanctioned amount", ["sanctioned_amount", "Sanctioned Amount"]),
            ("Final amount", ["final_amount", "Final Amount"]),
            ("Total expenditure", ["total_expenditure", "Total Expenditure"]),
        ]:
            value = next((financial[k] for k in keys if k in financial), None)
            lines.append(f"- **{label}:** {money(value)}")

    if isinstance(timeline, dict):
        lines.append("\n### Timeline")
        for label, keys in [
            ("Recommendation date", ["recommendation_date", "Recommendation Date"]),
            ("Sanction date", ["sanction_date", "Sanction Date"]),
            ("Completion date", ["completion_date", "Completion Date"]),
            ("Work stage", ["work_stage"]),
            ("Chronology", ["status", "chronology_status", "timeline_status"]),
        ]:
            value = next((timeline[k] for k in keys if k in timeline), None)
            if value is not None:
                lines.append(f"- **{label}:** {value}")

    if isinstance(comparison, dict):
        items = comparison.get("comparisons", comparison.get("similar_projects", []))
        if items:
            lines.append("\n### Comparable Projects")
            for item in items[:5]:
                wid2 = item.get("work_id", item.get("Work ID", "N/A"))
                amount = item.get("amount", item.get("final_amount", item.get("Final Amount")))
                sim = item.get("similarity_score", item.get("similarity"))
                lines.append(f"- Work ID {wid2}: amount {money(amount)}, similarity {sim if sim is not None else 'N/A'}")

    lines += [
        "\n### Recommended Verification Plan",
        "- Review the approved project scope and cost basis against actual site execution.",
        "- Cross-examine comparable projects with similar descriptions in the same state/category.",
        "\n### Conclusion",
        "The available indicators support focused verification but do not establish fraud or wrongdoing."
    ]
    return "\n".join(lines)


def _deterministic_risk_investigation_v4(work_id: int):
    details = _canonical_project_details(int(work_id))
    if not isinstance(details, dict) or details.get("error"):
        return "Risk data could not be loaded for the requested Work ID."

    project = details.get("project", {}) if isinstance(details.get("project"), dict) else {}
    score = details.get("risk_score")
    level = details.get("risk_level")
    reasons = details.get("risk_reasons", [])
    if isinstance(reasons, str):
        reasons = _normalize_reasons(reasons)

    lines = [
        "### Investigation Summary",
        f"- **Work ID:** {int(work_id)}",
        f"- **Project:** {project.get('description', 'N/A')}",
        f"- **Risk:** {str(level).upper()} — {float(score):.0f}/100" if score is not None else "- Risk: Unavailable",
        "",
        "### Risk Indicators",
    ]

    if reasons:
        lines.extend(f"- {reason}" for reason in reasons)
    else:
        lines.append("- No risk indicators were returned by the deterministic risk engine.")

    lines += [
        "",
        "### Interpretation",
        "These are contextual investigation indicators, not proof of fraud or wrongdoing."
    ]
    return "\n".join(lines)


def _deterministic_fallback(work_id, user_query=""):
    _, intent = _route_query_v4(str(user_query))
    if intent == "full":
        reset_agent_trace()
        return _deterministic_full_investigation_v4(work_id)
    if intent == "risk":
        return _deterministic_risk_investigation_v4(work_id)
    return _deterministic_full_investigation_v4(work_id)


def investigate_with_agent(user_query: str):
    work_id, intent = _route_query_v4(user_query)

    if intent == "full" and work_id is not None:
        reset_agent_trace()
        return _deterministic_full_investigation_v4(work_id)

    if intent == "risk" and work_id is not None:
        reset_agent_trace()
        return _deterministic_risk_investigation_v4(work_id)

    reset_agent_trace()
    normalized_query = user_query.lower()
    explicit_work_id = _extract_work_id(user_query)

    grounding_note = ""
    if explicit_work_id is not None:
        grounding_note = f"\n\nAUTHORITATIVE WORK ID FOR THIS REQUEST: {explicit_work_id}."

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + grounding_note},
        {"role": "user", "content": user_query}
    ]

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.2,
            reasoning_effort="low",
            include_reasoning=False,
            max_completion_tokens=1200
        )
    except Exception as exc:
        if explicit_work_id is not None:
            return _fallback_with_trace(explicit_work_id, user_query)
        raise

    assistant_message = response.choices[0].message
    if not assistant_message.tool_calls:
        return assistant_message.content

    tool_results = []
    for tool_call in assistant_message.tool_calls:
        tool_name = tool_call.function.name
        try:
            arguments = json.loads(tool_call.function.arguments)
        except json.JSONDecodeError:
            arguments = {}

        tool_result = execute_tool(tool_name, arguments)
        tool_results.append({
            "tool": tool_name,
            "arguments": arguments,
            "result": tool_result
        })

    evidence_text = json.dumps(tool_results, indent=2, default=str)
    final_messages = [
        {"role": "system", "content": SYSTEM_PROMPT + "\n\nSynthesize the final brief using only the evidence below."},
        {"role": "user", "content": user_query},
        {"role": "user", "content": f"EVIDENCE RETURNED:\n\n{evidence_text}\n\nProduce the final investigation brief."}
    ]

    try:
        final_response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=final_messages,
            temperature=0.0,
            reasoning_effort="low",
            include_reasoning=False,
            max_completion_tokens=1200
        )
        LAST_AGENT_TRACE.append({"tool": "AI synthesis", "status": "completed"})
        return final_response.choices[0].message.content
    except Exception:
        if explicit_work_id is not None:
            return _fallback_with_trace(explicit_work_id, user_query)
        raise