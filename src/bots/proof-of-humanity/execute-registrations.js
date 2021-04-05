const { gql } = require('graphql-request')

// executeRequest(address _submissionID)
// Conditions:
// - The challenge period must have passed.
// - The request can't be disputed.
// - The submission must have a pending status.
module.exports = async (graph, proofOfHumanity) => {
  const {
    contract: { challengePeriodDuration }
  } = await graph.request(
    gql`
      query contractVariablesQuery {
        contract(id: 0) {
          challengePeriodDuration
        }
      }
    `
  )

  let lastSubmisionID = "";
  let allSubmissions = [];
  while (true) {
    const { submissions } = await graph.request(
      gql`
        query executeRegistrationQuery($lastId: String) {
          # The submission must have a pending status.
          submissions(where: { status: "PendingRegistration", id_gt: $lastId }, first: 1000) {
            id
            requestsLength
            requests(orderBy: creationTime, orderDirection: desc, first: 1) {
              disputed
              lastStatusChange
            }
          }
        }
      `,
      {
        lastId: lastSubmisionID,
      }
    )
    allSubmissions = allSubmissions.concat(submissions)
    if (submissions.length < 1000) break
    lastSubmisionID = submissions[submissions.length-1].id
  }

  return (
    allSubmissions
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
