import uuid

from telethon import events, types
from telethon.tl import functions

from ..bus_stops import get_bus_stop_by_code, search_bus_stops
from ..favourites import list_favourites
from ..stop_view import build_stop_view

MAX_RESULTS = 8


def register_inline(client):
    """
    Inline mode: "@bot" with no query returns the user's favourites; any text
    is treated as a bus stop number or name search. Selecting a result posts a
    live-timings message with just a refresh button - no favourite toggle,
    since inline results can be posted into any chat and whoever taps the
    button may not be the user who ran the query, which would be confusing.
    """

    @client.on(events.InlineQuery())
    async def handler(event):
        query = event.text.strip()
        user_id = event.query.user_id

        if not query:
            candidates = [get_bus_stop_by_code(f["code"]) for f in list_favourites(user_id)]
            candidates = [c for c in candidates if c][:MAX_RESULTS]
        else:
            candidates = search_bus_stops(query, MAX_RESULTS)

        if not candidates:
            switch_pm = types.InlineBotSwitchPM(
                text="No matches, open the bot" if query else "No favourites yet, open the bot",
                start_param="start",
            )
            await client(
                functions.messages.SetInlineBotResultsRequest(
                    query_id=event.query.query_id,
                    results=[],
                    cache_time=5,
                    private=True,
                    switch_pm=switch_pm,
                )
            )
            return

        results = []
        for stop in candidates:
            try:
                view = await build_stop_view(stop["code"], user_id, inline_only=True)
                markdown = view["rich"]["markdown"]
                markup = client.build_reply_markup(view["buttons"])
            except Exception:
                markdown = f"# {stop['name']} ({stop['code']})\nCould not load live timings right now."
                markup = None

            results.append(
                types.InputBotInlineResult(
                    id=str(uuid.uuid4()),
                    type="article",
                    title=f"{stop['name']} ({stop['code']})",
                    description=stop["road"] or "Bus stop",
                    send_message=types.InputBotInlineMessageRichMessage(
                        rich_message=types.InputRichMessageMarkdown(markdown=markdown),
                        reply_markup=markup,
                    ),
                )
            )

        await client(
            functions.messages.SetInlineBotResultsRequest(
                query_id=event.query.query_id,
                results=results,
                cache_time=5,
                private=True,
            )
        )
