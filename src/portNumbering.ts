export const MAX_PORT_NUMBER = 999999;
export function validPortRange(start: unknown, count: number): start is number {
  return typeof start === 'number' && Number.isInteger(start) && start >= 0 && Number.isInteger(count) && count > 0 && count <= 256 && start + count - 1 <= MAX_PORT_NUMBER;
}

export const formatPrefixedPortNumber = (prefix: string, number: string | number) => `${prefix}${String(number).padStart(3, '0')}`;
