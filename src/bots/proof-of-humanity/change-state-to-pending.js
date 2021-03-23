const { gql } = require('graphql-request')

// changeStateToPending(address _submissionID, address[] calldata _vouches, bytes[] calldata _signatures, uint[] calldata _expirationTimestamps)
// Conditions:
// - The submission must have the vouching status.
// - The requester must have paid their fees.
// - The required number of vouches are required.
module.exports = async (graph, proofOfHumanity) => {
  let lastSubmisionID = "";
  let allSubmissions = [];
  while (true) {
    const {
      submissions
    } = await graph.request(
      gql`
        query changeStateToPendingQuery($lastId: String) {
          # The submission must have the vouching status.
          # Use id_gt instead of skip for better performance.
          submissions(where: { status: "Vouching", id_gt: $lastId }, first: 1000) {
            id
            requests(orderBy: creationTime, orderDirection: desc, first: 1) {
              challenges(orderBy: creationTime, orderDirection: desc, first: 1) {
                rounds(orderBy: creationTime, orderDirection: desc, first: 1) {
                  hasPaid
                }
              }
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

  const submissionsWithVouches = await Promise.all(
    allSubmissions
      // The requester must have paid their fees.
      .filter(
        (submission) =>
          submission.requests[0].challenges[0].rounds[0].hasPaid[0]
      )
      .map(async (submission) => ({
        ...submission,
        vouches: (await graph.request(
          gql`
            query vouchesQuery($id: [ID!]!) {
              submissions(where: { vouchees_contains: $id, usedVouch: null }) {
                id
              }
            }
          `,
          {
            id: [submission.id],
          }
        )).submissions.map((submission) => submission.id),
      }))
  )

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
  
  return (
    submissionsWithVouches
      // The required number of vouches are required.
      .filter(
        (submission) =>
          submission.vouches.length >= Number(requiredNumberOfVouches)
      )
      .map((submission) => ({
        args: [submission.id, submission.vouches, [], []],
        method: proofOfHumanity.methods.changeStateToPending,
        to: proofOfHumanity.options.address,
    }))
  )
}
