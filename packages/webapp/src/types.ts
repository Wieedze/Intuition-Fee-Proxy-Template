export type TabId = 'overview' | 'fee' | 'sponsoring' | 'topups' | 'metrics' | 'admins'

/**
 * 5-state machine for the "grant both roles" convenience flow.
 *   idle      — form empty / ready to start
 *   grant     — setWhitelistedAdmin tx pending (step 1)
 *   transfer  — transferProxyAdmin tx pending (step 2, fires after step 1 lands)
 *   done      — both txs mined; awaiting target to call acceptProxyAdmin()
 *   complete  — acceptance observed on-chain, rotation finalised
 */
export type AdminRotateStage =
  | 'idle'
  | 'grant'
  | 'transfer'
  | 'done'
  | 'complete'
