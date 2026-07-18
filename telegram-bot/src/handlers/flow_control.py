from telethon import events

from ..favourite_buses import list_favourite_buses
from ..flows import clear_flow, get_flow
from ..lta import _natural_sort_key
from ..routine_drafts import clear_draft


def register_flow_control(client):
    @client.on(events.NewMessage(pattern="/done"))
    async def done(event):
        flow = get_flow(event.chat_id)
        if not flow:
            await event.respond("You don't have anything in progress. Use /addfavbus to add favourite buses.")
            return

        clear_flow(event.chat_id)
        buses = sorted((row["service_no"] for row in list_favourite_buses(event.chat_id)), key=_natural_sort_key)
        if buses:
            await event.respond("Done! Your favourite buses: " + ", ".join(buses) + "\n\nUse /favbuses to view them.")
        else:
            await event.respond("Done! You have no favourite buses saved yet.")

    @client.on(events.NewMessage(pattern="/cancel"))
    async def cancel(event):
        flow = get_flow(event.chat_id)
        if not flow:
            await event.respond("Nothing to cancel.")
            return

        clear_flow(event.chat_id)
        if flow == "routine_wizard":
            clear_draft(event.chat_id)
        await event.respond("Cancelled.")
