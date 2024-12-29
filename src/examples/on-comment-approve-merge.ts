// import { filter, mergeMap } from "rxjs/operators";
// import { Pipeline } from "..";

// export const pipeline: Pipeline = (stream) =>
//   stream
//     .pipe(
//       filter((evt) => evt.tk.filter("pull_request_review.created")(evt)),
//       mergeMap((evt) => evt.tk.gh.withPRComments(evt, evt.ctx.pr.id)),
//       mergeMap((evt) => evt.tk.gh.approvePR(evt)),
//       mergeMap((evt) => evt.tk.gh.mergePR(evt))
//     )
//     .subscribe((event) => {
//       console.log(event.ctx);
//       // Output: { pr: { id: 42 }, prComments: [...], approved: true, merged: true }
//     });
