const { gql } = require('graphql-request')

// processVouches(address _submissionID, uint _requestID, uint _iterations)
// Conditions:
// - The request must be resolved.
// - The penalty index can't exceed the number of vouches.
module.exports = async (graph, proofOfHumanity) => {
  const {
    contract: { requiredNumberOfVouches }
  } = await graph.request(
    gql`
      query contractVariablesQuery {
        contract(id: 0) {
          requiredNumberOfVouches
        }
      }
    `
  )

  let lastSubmisionID = "";
  let allSubmissions = [];
  while (true) {
    const { submissions } = await graph.request(
      gql`
        query processVouchesQuery($lastId: String) {
          # require(request.resolved, "Submission should be resolved");
          # Use id_gt instead of skip for better performance.
          submissions(where: { status: "None", id_gt: $lastId }, first: 1000) {
            id
            requests(orderBy: creationTime) {
              resolved
              disputed
              vouches {
                id
              }
              penaltyIndex
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

  // AUTO_PROCESSED_VOUCH vouches are already processed when an undisputed request gets executed.
  const AUTO_PROCESSED_VOUCH = 10
  const vouchesAlreadyProcessed = requiredNumberOfVouches <= AUTO_PROCESSED_VOUCH

  return allSubmissions.flatMap(({ id, requests }) =>
    requests
      // The request must be resolved.
      // The penalty index can't exceed the number of vouches.
      .map(
        (request, index) =>
          request.resolved &&
          request.penaltyIndex < request.vouches.length && 
          (request.disputed || !vouchesAlreadyProcessed) && {
            args: [id, index, 15],
            method: proofOfHumanity.methods.processVouches,
            to: proofOfHumanity.options.address,
          }
      )
      .filter(Boolean)
  )
}
