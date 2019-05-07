const executePending = async ({
  batchedSend,
  fromBlock,
  tcrContract,
  type
}) => {
  const statusChangeEvents = await tcrContract.getPastEvents(
    `${type}StatusChange`,
    { fromBlock }
  )

  // Take most recent event for each item.
  const latestStatusChanges = {}
  statusChangeEvents.forEach(event => {
    const itemKey = event.raw.topics[3]
    if (!latestStatusChanges[itemKey]) {
      latestStatusChanges[itemKey] = event
      return
    }
    if (event.blockNumber > latestStatusChanges[itemKey].blockNumber)
      latestStatusChanges[itemKey] = event
  })

  const undisputedRequests = Object.keys(latestStatusChanges)
    .map(itemKey => latestStatusChanges[itemKey])
    .filter(requestEvent => {
      // Only take status change events emitted when starting a request.
      const {
        returnValues: { _status }
      } = requestEvent
      return Number(_status) > 1 // Statuses 2 and 3 are registration and removal requested.
    })
    .filter(requestEvent => {
      // Only take requests that were never challenged.
      const {
        raw: { topics }
      } = requestEvent
      const challenger = topics[2]
      return (
        challenger ===
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      )
    })
    .map(
      requestEvent =>
        type === 'Token'
          ? requestEvent.raw.topics[3]
          : `0x${requestEvent.raw.topics[3].slice(
              26,
              requestEvent.raw.topics[3].length
            )}` // Cast from bytes32
    )

  const challengePeriodDuration = await tcrContract.methods
    .challengePeriodDuration()
    .call()

  // Only take submissions that passed the challenge period.
  const timedOutRequests = await Promise.all(
    undisputedRequests.filter(async itemKey => {
      // Take the submission time from the latest request.
      const { numberOfRequests } = await tcrContract.methods[`get${type}Info`](
        itemKey
      ).call()
      const { submissionTime } = await tcrContract.methods
        .getRequestInfo(itemKey, numberOfRequests - 1)
        .call()
      return (
        Date.now() / 1000 >=
        Number(submissionTime) + Number(challengePeriodDuration)
      )
    })
  )

  // Execute pending items.
  await Promise.all(
    timedOutRequests.map(async itemKey => {
      batchedSend({
        args: [itemKey],
        method: tcrContract.methods.executeRequest,
        to: tcrContract.options.address
      })
    })
  )

  return timedOutRequests
}

module.exports = {
  executePending
}
