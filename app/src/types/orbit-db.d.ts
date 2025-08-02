declare module 'orbit-db' {
  export default class OrbitDB {
    static createInstance(ipfs: any): Promise<OrbitDB>;
    keyvalue(name: string): Promise<any>;
    feed(name: string): Promise<any>;
    id: string;
    stop(): Promise<void>;
  }
} 