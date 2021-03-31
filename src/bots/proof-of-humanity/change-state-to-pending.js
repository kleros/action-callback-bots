const { gql } = require('graphql-request')

// changeStateToPending(address _submissionID, address[] calldata _vouches, bytes[] calldata _signatures, uint[] calldata _expirationTimestamps)
// Conditions:
// - The submission must have the vouching status.
// - The requester must have paid their fees.
// - The required number of vouches are required.
module.exports = async (graph, proofOfHumanity) => {
  const {
    contract: { requiredNumberOfVouches, submissionDuration }
  } = await graph.request(
    gql`
      query contractVariablesQuery {
        contract(id: 0) {
          requiredNumberOfVouches
          submissionDuration
        }
      }
    `
  )

  let lastSubmisionID = "";
  let validSubmissions = [];
  while (true) {
    const {
      submissions
    } = await graph.request(
      gql`
        query changeStateToPendingQuery($lastId: String, $submissionTimestamp: BigInt) {
          # The submission must have the Vouching status.
          # Use id_gt instead of skip for better performance.
          submissions(where: { status: "Vouching", id_gt: $lastId }, first: 1000) {
            id
            vouchesReceived(where: { usedVouch: null, registered: true, submissionTime_gt: $submissionTimestamp }) {
              id
            }
            requests(orderBy: creationTime, orderDirection: desc, first: 1) {
              creationTime
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
        submissionTimestamp: Date.now() - submissionDuration,
      }
    )
    validSubmissions = validSubmissions.concat(
      submissions.filter(
        // Filter out submissions that are not fully funded.
        (submission) =>
          submission.requests[0].challenges[0].rounds[0].hasPaid[0]
      )
    )
    if (submissions.length < 1000) break
    lastSubmisionID = submissions[submissions.length-1].id
  }

  // Prioritize older submissions (follow FIFO when two submissions share the same vouches).
  validSubmissions.sort((a, b) => { a.request[0].creationTime - b.request[0].creationTime });

  // Addresses are allowed to vouch many submissions simultaneously.
  // However, only one vouch per address can be used at a time.
  // Therefore, duplicated vouchers are removed in the following lines.
  let usedVouches = []
  for (i = 0; i < validSubmissions.length; i++) {
    for (j = validSubmissions[i].vouchesReceived.length-1; j >= 0; j--) {
      // Iterates vouches backwards in order to remove duplicates on the go.
      if (usedVouches.includes(validSubmissions[i].vouchesReceived[j])) {
        validSubmissions[i].vouchesReceived.splice(j, 1);
      }
    }
    if (validSubmissions[i].vouchesReceived.length >= Number(requiredNumberOfVouches)) {
      // Only consider submissions with enough vouches to pass to PendingRegistration.
      usedVouches = [...usedVouches, ...validSubmissions[i].vouchesReceived]
    }
  }

  return (
    validSubmissions
      .filter(
        (submission) =>
          submission.vouchesReceived.length >= Number(requiredNumberOfVouches)
      )
      .map((submission) => ({
        args: [submission.id, submission.vouchesReceived, [], []],
        method: proofOfHumanity.methods.changeStateToPending,
        to: proofOfHumanity.options.address,
    }))
  )
}
