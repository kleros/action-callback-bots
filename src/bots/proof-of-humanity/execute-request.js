const { gql } = require('graphql-request')

// executeRequest(address _submissionID)
// require(now - request.lastStatusChange > challengePeriodDuration, "Can't execute yet");
// require(!request.disputed, "The request is disputed");
// require(submission.status == Status.PendingRegistration || submission.status == Status.PendingRemoval);
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
        # require(submission.status == Status.PendingRegistration || submission.status == Status.PendingRemoval);
        pendingRegistration: submissions(
          where: { status: "PendingRegistration" }
        ) {
          id
          requests(orderBy: creationTime, orderDirection: desc, first: 1) {
            disputed
            lastStatusChange
          }
        }
        # require(submission.status == Status.PendingRegistration || submission.status == Status.PendingRemoval);
        pendingRemoval: submissions(where: { status: "PendingRemoval" }) {
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
      // require(!request.disputed, "The request is disputed");
      // require(now - request.lastStatusChange > challengePeriodDuration, "Can't execute yet");
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
