export interface ManualSection {
  id: string;
  title: string;
  level: number;
  content: string;
}

export interface ManualDocument {
  title: string;
  sourceFile?: string;
  updatedAt?: string;
  sections: ManualSection[];
}
