export default function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    let timeoutId: NodeJS.Timeout | undefined = undefined;
    
    return function (...args: Parameters<T>): Promise<ReturnType<T>> {
        return new Promise((resolve) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                resolve(func(...args));
            }, delay);
        });
    };
}