export default function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    let timeoutId: NodeJS.Timeout | undefined = undefined;
    
    return function (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
        return new Promise((resolve) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(async () => {
                resolve(await func(...args));
            }, delay);
        });
    };
}