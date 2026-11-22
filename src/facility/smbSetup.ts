export type SmbPortEntryMode = 'range' | 'individual';

export function smbPortNumbers(mode: SmbPortEntryMode, start: string, end: string, entries: string[]): number[] {
  const parse = (value: string) => {
    if (!/^\d+$/.test(value.trim())) throw new Error('Enter whole port numbers from 1 to 999999.');
    const number = Number(value.trim());
    if (number < 1 || number > 999999) throw new Error('Enter whole port numbers from 1 to 999999.');
    return number;
  };
  let numbers: number[];
  if (mode === 'range') {
    if (!start.trim() || !end.trim()) throw new Error('Enter the first and last port numbers.');
    const first = parse(start), last = parse(end);
    if (last < first) throw new Error('The last port must be greater than or equal to the first port.');
    if (last - first + 1 > 8) throw new Error('An SMB can contain up to 8 ports.');
    numbers = Array.from({length: last - first + 1}, (_, i) => first + i);
  } else {
    const values = entries.filter(value => value.trim());
    if (!values.length) throw new Error('Enter at least one port number, or choose Configure later.');
    if (values.length > 8) throw new Error('An SMB can contain up to 8 ports.');
    numbers = values.map(parse);
  }
  if (new Set(numbers).size !== numbers.length) throw new Error('Each port number must be different.');
  return numbers;
}
