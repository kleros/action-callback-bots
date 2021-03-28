const { gql } = require('graphql-request')

// executeRequest(address _submissionID)
// Conditions:
// - The challenge period must have passed.
// - The request can't be disputed.
// - The submission must have a pending status.
module.exports = async (graph, proofOfHumanity) => {
  const {
    contract: { challengePeriodDuration },
    pendingRegistration,
    pendingRemoval
  } = await graph.request(
    gql`
      query executeRequestQuery {
        contract(id: 0) {
          challengePeriodDuration
        }
        # The submission must have a pending status.
        pendingRegistration: submissions(where: { status: "PendingRegistration" }, first: 1000) {
          id
          requests(orderBy: creationTime, orderDirection: desc, first: 1) {
            disputed
            lastStatusChange
          }
        }
        # The submission must have a pending status.
        pendingRemoval: submissions(where: { status: "PendingRemoval" }, first: 1000) {
          id
          requests(orderBy: creationTime, orderDirection: desc, first: 1) {
            disputed
            lastStatusChange
          }
        }
      }
    `
  )

  return (
    [...pendingRegistration, ...pendingRemoval]
      // The request can't be disputed.
      // The challenge period must have passed.
      .filter(
        ({ requests: [request] }) =>
          !request.disputed &&
          Date.now() - request.lastStatusChange * 1000 >
            challengePeriodDuration * 1000
      )
      .map(submission => ({
        args: [submission.id],
        method: proofOfHumanity.methods.executeRequest,
        to: proofOfHumanity.options.address
      }))
  )
}
