// SPDX-License-Identifier: Apache-2.0
// Build-time compiler shared by the local workbench and Cloudflare packaging.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import solc from 'solc';
import { toFunctionSelector } from 'viem';

export function compileLedger(root = new URL('../../../', import.meta.url)) {
  const source = readFileSync(new URL('src/AgentLedger.sol', root), 'utf8');
  const input = { language: 'Solidity', sources: { 'src/AgentLedger.sol': { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences', 'metadata'] } } } };
  const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (compiled.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw Error(errors.map(error => error.formattedMessage).join('\n'));
  const contract = compiled.contracts['src/AgentLedger.sol'].AgentLedger;
  return { contractName: 'AgentLedger', compiler: solc.version(), evmVersion: 'shanghai',
    optimizerRuns: 200, sourceSha256: createHash('sha256').update(source).digest('hex'),
    abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object,
    recorderSelector: toFunctionSelector('paymentRecorder()'),
    createTaskSelector: toFunctionSelector('createTask(bytes32,bytes32,uint256)'),
    getTaskSelector: toFunctionSelector('getTask(bytes32)'),
    immutableReferences: contract.evm.deployedBytecode.immutableReferences,
    deployedBytecode: '0x' + contract.evm.deployedBytecode.object, metadata: JSON.parse(contract.metadata) };
}
