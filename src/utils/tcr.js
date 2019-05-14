const executePending = async ({
  batchedSend,
  fromBlock,
  tcrContract,
  toBN,
  type
}) => {
  const statusChangeEvents = await tcrContract.getPastEvents(
    `${type}StatusChange`,
    { fromBlock }
  )

  // Take most recent event for each item.
  const latestStatusChanges = {}
  let latestBlockNumber = fromBlock
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

  const challengePeriodDuration = toBN(
    await tcrContract.methods.challengePeriodDuration().call()
  )

  // Only take submissions that passed the challenge period.
  const timedOutRequests = (await Promise.all(
    undisputedRequests.map(async event => {
      const itemKey =
        type === 'Token'
          ? event.raw.topics[3]
          : `0x${event.raw.topics[3].slice(
              // Cast address from bytes32
              26,
              event.raw.topics[3].length
            )}`

      // Take the submission time from the latest request.
      const { numberOfRequests } = await tcrContract.methods[`get${type}Info`](
        itemKey
      ).call()
      const submissionTime = toBN(
        (await tcrContract.methods
          .getRequestInfo(itemKey, numberOfRequests - 1)
          .call()).submissionTime
      )

      const timedOut = toBN(Math.trunc(Date.now() / 1000).toString()).gte(
        submissionTime.add(challengePeriodDuration)
      )

      // Cache the block number of the most recent timed out submission.
      if (timedOut && event.blockNumber > latestBlockNumber)
        latestBlockNumber = event.blockNumber

      return {
        itemKey,
        timedOut
      }
    })
  ))
    .filter(item => item.timedOut)
    .map(item => item.itemKey)

  // Execute pending items.
  batchedSend(
    timedOutRequests.map(itemKey => ({
      args: [itemKey],
      method: tcrContract.methods.executeRequest,
      to: tcrContract.options.address
    }))
  )

  return latestBlockNumber
}

module.exports = {
  executePending
}
