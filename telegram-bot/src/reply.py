from telethon import types
from telethon.errors import MessageNotModifiedError
from telethon.tl import functions


def _rich_markdown(rich):
    return types.InputRichMessageMarkdown(markdown=rich["markdown"])


async def send_rich_message(client, entity, rich, buttons=None):
    """
    Sends a rich (real headings/tables) message via the raw sendMessage
    rich_message field, falling back to a plain-text send if the rich payload
    is rejected for any reason rather than letting the request error out
    silently.
    """
    markup = client.build_reply_markup(buttons) if buttons else None
    try:
        return await client(
            functions.messages.SendMessageRequest(
                peer=entity,
                message=rich["fallback"],
                rich_message=_rich_markdown(rich),
                reply_markup=markup,
            )
        )
    except Exception as err:
        print(f"[send_rich_message] rich send failed, falling back to plain text: {err}")
        return await client.send_message(entity, rich["fallback"], buttons=buttons)


async def edit_rich_message(client, event, rich, buttons=None):
    """Edits the message a CallbackQuery event originated from, regular or inline."""
    markup = client.build_reply_markup(buttons) if buttons else None
    is_inline = isinstance(event.query, types.UpdateInlineBotCallbackQuery)
    try:
        if is_inline:
            await client(
                functions.messages.EditInlineBotMessageRequest(
                    id=event.query.msg_id,
                    message=rich["fallback"],
                    rich_message=_rich_markdown(rich),
                    reply_markup=markup,
                )
            )
        else:
            await client(
                functions.messages.EditMessageRequest(
                    peer=event.query.peer,
                    id=event.query.msg_id,
                    message=rich["fallback"],
                    rich_message=_rich_markdown(rich),
                    reply_markup=markup,
                )
            )
    except MessageNotModifiedError:
        return
    except Exception as err:
        print(f"[edit_rich_message] rich edit failed, falling back to plain text: {err}")
        if is_inline:
            await client.edit_message(event.query.msg_id, text=rich["fallback"], buttons=buttons)
        else:
            await client.edit_message(event.query.peer, event.query.msg_id, text=rich["fallback"], buttons=buttons)
