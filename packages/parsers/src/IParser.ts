import { OmniGraph } from './types';

export interface IParser {
  /** Returns true if this parser can handle the given file path */
  canHandle(filePath: string): boolean;
  /** Parse a single file and return partial graph data */
  parse(filePath: string, source: string): Partial<OmniGraph>;
}
