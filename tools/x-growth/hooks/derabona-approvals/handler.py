"""Deprecated observer hook: deliberately cannot approve or start a worker.

Approval ingress now belongs to plugins/derabona-approvals/pre_gateway_dispatch.
Keep this no-op during upgrades so accidentally retained hooks cannot double-act.
"""
async def handle(event_type, context):
    return None
