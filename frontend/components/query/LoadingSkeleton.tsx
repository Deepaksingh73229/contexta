export const LoadingSkeleton = () => {
    return (
        <div className="flex flex-row gap-2 items-center">
            <div className="animate-pulse bg-gray-300 w-8 h-8 rounded-full" />

            <div className="flex flex-col gap-1">
                <div className="animate-pulse bg-gray-300 w-28 h-2 rounded-full" />
                <div className="animate-pulse bg-gray-300 w-36 h-2 rounded-full" />
            </div>
        </div>
    );
}