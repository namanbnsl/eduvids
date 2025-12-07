create stack of all pending questions so videos are always eventually generated.
add app on google search console (https://search.google.com/search-console/)
better text sizing
move to 2d scene for last CTA scene
edit script on the go
better layout engine

notes:

- previous messages just dont show up in UI

NonRetriableError: The operation was aborted due to timeout
at /var/task/.next/server/chunks/[root-of-the-server]**57eb680f.\_.js:2438:2425
at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
at async E.tryExecuteStep (/var/task/.next/server/chunks/[root-of-the-server]**5dcb5db0._.js:7:60605)
at async steps-found (/var/task/.next/server/chunks/[root-of-the-server]\_\_5dcb5db0._.js:7:59771)
at async E._start (/var/task/.next/server/chunks/[root-of-the-server]\_\_5dcb5db0._.js:7:59159)
at async a.InngestCommHandler.handleAction (/var/task/.next/server/chunks/[root-of-the-server]**5dcb5db0.\_.js:7:21134)
at async a.ServerTiming.wrap (/var/task/.next/server/chunks/[root-of-the-server]**5dcb5db0._.js:1:74243)
[cause]: {
"**serialized": true,
"code": 23,
"message": "The operation was aborted due to timeout",
"name": "DOMException",
"stack": "TimeoutError: The operation was aborted due to timeout\n at node:internal/deps/undici/undici:13510:13\n at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n at async u (/var/task/.next/server/chunks/[root-of-the-server]**57eb680f._.js:107:3196)\n at async aU.write (/var/task/.next/server/chunks/[root-of-the-server]**57eb680f.\_.js:107:124801)\n at async nR (/var/task/.next/server/chunks/[root-of-the-server]**57eb680f._.js:2336:2227)\n at async /var/task/.next/server/chunks/[root-of-the-server]\_\_57eb680f._.js:2438:1214\n at async E.tryExecuteStep (/var/task/.next/server/chunks/[root-of-the-server]**5dcb5db0.\_.js:7:60605)\n at async steps-found (/var/task/.next/server/chunks/[root-of-the-server]**5dcb5db0._.js:7:59771)\n at async E.\_start (/var/task/.next/server/chunks/[root-of-the-server]\_\_5dcb5db0._.js:7:59159)\n at async a.InngestCommHandler.handleAction (/var/task/.next/server/chunks/[root-of-the-server]\__5dcb5db0._.js:7:21134)"
}

getting this erorr on run id: 01KBDB9YKSS6TDTSEFDR9NSBNQ
