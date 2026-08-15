from telethon import events

from ..flows import end_flow, flow_definition, get_flow


def register_flow_control(client):
    """/done and /cancel, for whatever flow the chat happens to be in the middle of.
    Neither command knows what any individual flow is - they work off what the flow
    registered about itself, so every command that keeps chat state, now or later, gets
    both of them for free."""

    @client.on(events.NewMessage(pattern="/done"))
    async def done(event):
        name = get_flow(event.chat_id)
        if not name:
            await event.respond("You don't have anything in progress.")
            return

        flow = flow_definition(name)
        if not flow:
            # Left behind by an older version of the bot: nothing left that knows how to
            # finish it, so just clear it rather than stranding the chat mid-flow.
            end_flow(event.chat_id, name)
            await event.respond("Done!")
            return

        if not flow.finish:
            await event.respond(
                f"You're in the middle of {flow.description}, which finishes on its own once "
                "you've answered. Use /cancel if you'd rather stop."
            )
            return

        message = flow.finish(event.chat_id)
        end_flow(event.chat_id, name)
        await event.respond(message)

    @client.on(events.NewMessage(pattern="/cancel"))
    async def cancel(event):
        name = get_flow(event.chat_id)
        if not name:
            await event.respond("Nothing to cancel.")
            return

        flow = flow_definition(name)
        end_flow(event.chat_id, name)
        await event.respond(f"Cancelled {flow.description}." if flow else "Cancelled.")
