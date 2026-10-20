"""Adapter Registry prototype (non-frozen).

Design goal: future platform adapters (custom themes, Shopify, ...)
register once here with a declared evidence contract, instead of each
requiring a new frozen-validator allowlist entry. This prototype only
validates adapter outputs offline against the same fail-closed rules
the Workspace validator enforces; it changes no frozen file. A future
single frozen exception could accept registry-attested methods
generically - that decision is Owner-gated and out of scope here.
"""

from declared_product import rescue_declared_product


class RegistryError(ValueError):
    pass


# adapter_id -> (method, builder). The method string is what the frozen
# validator sees; today only pre-existing methods pass frozen validation,
# which is exactly the gap a registry-attested exception would close.
REGISTRY = {
    "declared-product-dom-v1": ("declared_product_dom", rescue_declared_product),
}


def run_adapter(adapter_id, report):
    """Run a registered adapter on a pre-rescue report.

    Returns the rescued product report, or None when the adapter stays
    fail-closed. Raises RegistryError for unregistered adapters or for
    outputs that violate the evidence contract.
    """
    if adapter_id not in REGISTRY:
        raise RegistryError(f"unregistered adapter: {adapter_id}")
    method, builder = REGISTRY[adapter_id]
    result = builder(report)
    if result is None:
        return None
    _validate_contract(adapter_id, method, result)
    return result


def _validate_contract(adapter_id, method, result):
    if result.get("page_type") != "product":
        raise RegistryError(f"{adapter_id}: output must be a product report")
    extraction = result.get("extraction") or {}
    if extraction.get("method") != method:
        raise RegistryError(f"{adapter_id}: method mismatch")
    snapshot = result.get("snapshot") or {}
    if not snapshot.get("sha256"):
        raise RegistryError(f"{adapter_id}: missing snapshot sha256")
    facts = result.get("facts") or {}
    asserted = [f for f in facts.values() if isinstance(f, dict) and f.get("value")]
    if not asserted:
        raise RegistryError(f"{adapter_id}: no asserted facts")
    for fact in asserted:
        if fact.get("verification") != "source_asserted":
            raise RegistryError(f"{adapter_id}: facts must be source_asserted")
        if not fact.get("citations"):
            raise RegistryError(f"{adapter_id}: fact without citation")
    description = facts.get("description") or {}
    scope = description.get("product_scope") or {}
    if description.get("value") and not scope.get("product_name"):
        raise RegistryError(f"{adapter_id}: description lacks product scope")
