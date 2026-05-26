export type NewsTagVariant = "important" | "tech" | "announce" | "data";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  tag: string;
  tagVariant: NewsTagVariant;
  content: string;
  author?: string;
  readTime?: string;
  coverImage?: string;
  views?: number;
}
