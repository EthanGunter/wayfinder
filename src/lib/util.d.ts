type PartialWith<T, K> = Pick<T, K> & Partial<Omit<T, K>>;
