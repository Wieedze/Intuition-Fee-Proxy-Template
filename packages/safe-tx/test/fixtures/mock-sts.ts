import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * In-process mock of the Safe Transaction Service. Implements just the
 * 4 endpoints our api-kit client uses:
 *
 *   POST /api/v1/safes/{safe}/multisig-transactions/
 *   POST /api/v1/multisig-transactions/{hash}/confirmations/
 *   GET  /api/v1/multisig-transactions/{hash}/
 *   GET  /api/v1/safes/{safe}/multisig-transactions/
 *
 * No signature/owner/nonce validation — tests are responsible for
 * passing well-formed payloads. The mock just stores and returns them.
 */

export type StoredConfirmation = {
  owner: string
  signature: string
}

export type StoredTx = {
  contractTransactionHash: string
  to: string
  value: string
  data: string
  operation: number
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: string
  refundReceiver: string
  nonce: string
  sender: string
  signature: string
  confirmations: StoredConfirmation[]
}

export type MockSts = {
  url: string
  port: number
  stop: () => Promise<void>
  /** All txs currently stored, optionally filtered by hash. */
  getStored: (hash?: string) => StoredTx[]
  reset: () => void
}

export async function startMockSts(opts: { port?: number } = {}): Promise<MockSts> {
  const port = opts.port ?? 8888
  const txs = new Map<string, StoredTx>()

  const server = createServer((req, res) => {
    handleRequest(req, res, txs).catch((err) => {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: String(err) }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
    getStored: (hash) =>
      hash ? (txs.has(hash) ? [txs.get(hash)!] : []) : [...txs.values()],
    reset: () => txs.clear(),
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  txs: Map<string, StoredTx>,
): Promise<void> {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  // POST /api/v1/safes/{addr}/multisig-transactions/
  const proposeMatch = url.match(
    /^\/api\/v1\/safes\/(0x[a-fA-F0-9]{40})\/multisig-transactions\/?$/,
  )
  if (proposeMatch && method === 'POST') {
    const body = await readJsonBody<Omit<StoredTx, 'confirmations'>>(req)
    txs.set(body.contractTransactionHash, {
      ...body,
      confirmations: [{ owner: body.sender, signature: body.signature }],
    })
    return respondJson(res, 201, { contractTransactionHash: body.contractTransactionHash })
  }

  // POST /api/v1/multisig-transactions/{hash}/confirmations/
  const confirmMatch = url.match(
    /^\/api\/v1\/multisig-transactions\/(0x[a-fA-F0-9]{64})\/confirmations\/?$/,
  )
  if (confirmMatch && method === 'POST') {
    const hash = confirmMatch[1]
    const body = await readJsonBody<{ signature: string; owner?: string }>(req)
    const tx = txs.get(hash)
    if (!tx) return respondJson(res, 404, { detail: 'Not found' })
    tx.confirmations.push({ owner: body.owner ?? 'unknown', signature: body.signature })
    return respondJson(res, 201, {})
  }

  // GET /api/v1/multisig-transactions/{hash}/
  const getTxMatch = url.match(/^\/api\/v1\/multisig-transactions\/(0x[a-fA-F0-9]{64})\/?$/)
  if (getTxMatch && method === 'GET') {
    const hash = getTxMatch[1]
    const tx = txs.get(hash)
    if (!tx) return respondJson(res, 404, { detail: 'Not found' })
    return respondJson(res, 200, tx)
  }

  // GET /api/v1/safes/{addr}/multisig-transactions/...?
  const listMatch = url.match(/^\/api\/v1\/safes\/(0x[a-fA-F0-9]{40})\/multisig-transactions\/?/)
  if (listMatch && method === 'GET') {
    return respondJson(res, 200, {
      count: txs.size,
      next: null,
      previous: null,
      results: [...txs.values()],
    })
  }

  res.statusCode = 404
  res.end()
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}
