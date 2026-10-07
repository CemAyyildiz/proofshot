/**
 * Registries this repository knows about, with the block each was deployed in. A reader that starts there, instead of
 * at block 0, has nothing to scan before the Registry existed. Mirrors `contracts/deployments/<chainId>.json`.
 */
export const KNOWN_REGISTRIES: { chainId: number; registry: `0x${string}`; deployBlock: bigint }[] = [
  { chainId: 143, registry: "0xa6989c9f93d70526c1b982a5A408DF240575E433", deployBlock: 111_297_137n },
];

/** The deploy block of a known Registry, or undefined for any other address or chain. */
export function knownDeployBlock(chainId: number, registry: string): bigint | undefined {
  return KNOWN_REGISTRIES.find((r) => r.chainId === chainId && r.registry.toLowerCase() === registry.toLowerCase())?.deployBlock;
}
