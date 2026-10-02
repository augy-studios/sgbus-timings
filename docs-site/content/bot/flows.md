---
title: Lists, flows and cancelling
description: How long lists are split into pages, and how /done and /cancel work when the bot is waiting for an answer.
---

## Paginated lists

A list too long for one message, such as the stops on a route, your favourite
buses or your routines, is split into pages, with a row underneath:

**Prev** · **2/5** · **Next**

The row wraps around, so there is never a dead end. On the first page the left
button reads **Last** and jumps to the last page; on the last page the right
button reads **First** and jumps back to the start.

## Flows: when the bot is waiting for an answer

Some commands ask a question and wait for your reply. While one is waiting, the
chat is "in a flow", and what you send is taken as the answer rather than as a
search.

| Command | What it waits for |
|---|---|
| `/addfavbus` | Bus numbers, until you send `/done` |
| `/addroutine` | The time, the days, the stop, then the buses |
| `/route` | The start, then the end |
| `/settings`, after **Set name** or **Set birthday** | Your name, or your birthday |
| Editing a routine | Its new time, days, stop or buses |

Only one flow runs at a time. Starting another command that asks questions
replaces the one in progress.

## `/cancel`

Stops whatever the bot is waiting for, and throws away anything half done, such
as a routine you had not finished setting up. It says what it stopped:
"Cancelled setting up a routine."

## `/done`

Finishes a flow that has something to finish:

- In `/addfavbus`, each bus is saved as you send it, so `/done` just ends the
  flow and shows your favourite buses.
- In the bus grid of `/addroutine`, tapping **Done** saves your choice.
- Questions that need every answer before anything can be saved, like the
  routine questions, cannot be finished early. `/done` says so, and points you
  to `/cancel`.

With nothing in progress, both commands say so and do nothing.
