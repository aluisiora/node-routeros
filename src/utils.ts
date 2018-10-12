export const debounce = (callback, timeout = 0) => {
    let timeoutObj = null;
    return (...args) => {
        const context = this;
        clearTimeout(timeoutObj);
        timeoutObj = setTimeout(() => callback.apply(context, args), timeout);
    };
};
