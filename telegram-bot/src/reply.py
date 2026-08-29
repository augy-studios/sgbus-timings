from telethon import types
from telethon.errors import MessageNotModifiedError
from telethon.tl import functions


def _rich_markdown(rich):
    return types.InputRichMessageMarkdown(markdown=rich["markdown"])


# Editing a message without a reply markup leaves whatever keyboard it has in place; an
# inline keyboard with no rows at all is what actually takes one away.
_NO_BUTTONS = types.ReplyInlineMarkup(rows=[])


def sent_message_id(result) -> "int | None":
    """The id of the message a send request created. A bot's own send comes back as the
    updates it caused rather than as the message, so the id has to be dug out of them."""
    if isinstance(result, (types.Message, types.UpdateShortSentMessage)):
        return result.id
    for update in getattr(result, "updates", []):
        if isinstance(update, types.UpdateMessageID):
            return update.id
        if isinstance(update, (types.UpdateNewMessage, types.UpdateNewChannelMessage)):
            return update.message.id
    return None


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


async def edit_rich_message_at(client, peer, msg_id, rich, buttons=None):
    """Edits a message the bot sent earlier, addressed by chat and message id rather than
    by a callback that arrived on it - for going back over a message a flow left behind.
    Passing no buttons takes the message's keyboard away rather than leaving it as it was."""
    markup = client.build_reply_markup(buttons) if buttons else _NO_BUTTONS
    try:
        await client(
            functions.messages.EditMessageRequest(
                peer=peer,
                id=msg_id,
                message=rich["fallback"],
                rich_message=_rich_markdown(rich),
                reply_markup=markup,
            )
        )
    except MessageNotModifiedError:
        return
    except Exception as err:
        print(f"[edit_rich_message_at] rich edit failed, falling back to plain text: {err}")
        await client.edit_message(peer, msg_id, text=rich["fallback"], buttons=buttons)


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
