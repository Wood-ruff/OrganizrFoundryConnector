/** A queue whose `run(task)` starts each task only after every earlier one settled; a failed task does not block the next. */
export function createSerialQueue() {
  let tail = Promise.resolve();
  return {
    run(task) {
      const result = tail.then(() => task());
      tail = result.then(ignore, ignore);
      return result;
    }
  };
}

function ignore() {}
