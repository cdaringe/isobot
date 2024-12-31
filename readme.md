# isobot

A probot library and application to make running repo-configurable scripts easy and powerful.

## What

`isobot` lets you, a repo owner, write an executable script to do work.

- 🟢 Code! isobot lets you, the repo owner, run code. Testable, statically analyzable, sweet code.
- 🔴 Configuration. Most github/Probot applications use YAML or JSON _configuration_ to drive bot activity. This is hard to get correct, and offers little in the way of 1) correctness verification, 2) flexibility!

Here's an example of a `.github/isobot.ts` file that sniffs for `/merge` comment commands,
and has the bot approve and merge the PR.

```ts
export const pipeline: Pipeline = (
  stream,
  {
    rxjs: {
      operators: { filter, mergeMap },
    },
  }
) =>
  stream.pipe(
    filter((evt) => evt.name === "issue_comment"),
    mergeMap((evt) => evt.tk.gh.withPR(evt, evt.payload.issue.number)),
    mergeMap((evt) => evt.tk.gh.withPRComments(evt, evt.payload.issue.number)),
    filter((evt) =>
      evt.ctx.prComments.some((it) => it.body?.startsWith("/merge"))
    ),
    mergeMap((evt) => evt.tk.gh.approvePR(evt, evt.ctx.pr.number)),
    mergeMap((evt) => evt.tk.gh.mergePR(evt, evt.ctx.pr.number))
  );
```

### Usage - End user

```ts
// Basic pipeline. Receive all probot events, do nothing with them
export const pipeline: Pipeline = (stream) => stream;

// The `event`s on the stream are decorated with rich resources
stream.pipe(
  filter((event) => event.name === "issue_comment"),
  mergeMap((event) => {
    event.ctx; // starts off typed as the empty object, {}
    event.tk; // toolkit!
    const nextEvent = event.tk.updateContext(event, { foo: 123 });
    // nextEvent.ctx.foo === 123, typed!

    /**
     * instantiated octokit rest instance!
     * @see {@link https://octokit.github.io/rest.js/v18/}
     */
    event.tk.octokit;

    event.tk.gh; // github toolkit. sugar functions that extend the context using updateContext

    return event.tk.gh.withPRComments(evt, evt.payload.issue.number);
  }),
  mergeMap((event) => {
    event.ctx.prComments; // now populated from github API!

    /**
     * Always emit/return the event from the pipeline.
     * State should be added via update context.
     */
    return event;
  })
);
```

### Usage - Deployment

`isobot` can be plugged directly into a `probot` app, as it is _library first_. It also hosts a `bin` file, such that you can install the npm package and run it directly.

Please see [probot documentation](https://probot.github.io/) for more.

### Design observations

- This library is new! You are invited to add context-updating sugar functions to the `toolkit/tk`.
- You will note the use of `rxjs`. This little implementation detail (which may be a turn off for some) is present such that
  we can very concisely express pipelines. You can _generally_ opt out if desired, so long as `pipeline` returns an observable that produces an event.

You may observe that running repo-code is intrinsically _risky_.

- RISK: Repo owners are commanding the _bot_, meaning the bot has _power_ to possibly do evil.

  - MITIGATION 1: Limit your bot installation. Limit events it can receive, limit repos it can act on. If you want multiple bots with different powers/capabilities, deploy `isobot` as _different_ applications with different permissions!
  - MITIGATION 2: `isobot` files are run in a semi-protected sandbox. User code generally cannot meddle with the host application. User code _cannot_ import libraries, including node.js primitives.

- This project is _new_. It is tested, but offers little capability and needs active contribution to make it great! Please see the open issues.

## Appendix

### Opting-out of rxjs

```ts
export const pipeline = (
  stream,
  {
    rxjs: {
      operators: { tap },
    },
  }
) =>
  stream.pipe(
    tap(async (event) => {
      // Regular async/await work here
      const response = await fetch("https://api.example.com");
      const data = await response.json();

      // Regular loops
      for (const item of data) {
        await processItem(item);
      }

      // Regular promises
      await Promise.all([doThing1(), doThing2(), doThing3()]);

      // Regular try/catch
      try {
        await riskyOperation();
      } catch (err) {
        console.error(err);
      }
    })
  );
```
