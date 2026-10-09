(() => {
    const dataKeys = [
        "foodHubOrders",
        "foodHubOrderStatuses",
        "foodHubKitchenOrders",
        "foodHubProducts",
        "foodHubInventory",
        "foodHubSettings",
        "foodHubStaff",
        "foodHubRestaurantLogo",
        "foodHubNextOrderNumber",
        "foodHubOrderHistoryCleared"
    ];
    const ownerKey = "foodHubBackendUserId";
    const saveQueues = new Map();
    let accessToken = "";

    function showSyncError(message) {
        console.error(message);
        const toast = document.getElementById("settingsSavedToast");
        if (!toast) {
            return;
        }

        toast.classList.add("backend-error");
        toast.textContent = message;
        toast.classList.remove("hidden");
        window.clearTimeout(showSyncError.timeout);
        showSyncError.timeout = window.setTimeout(() => {
            toast.classList.add("hidden");
            toast.classList.remove("backend-error");
        }, 7000);
    }

    async function request(path, token, options = {}) {
        const response = await fetch(`/api${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers
            }
        });

        if (!response.ok) {
            let detail = response.statusText || "Request failed";
            try {
                const body = await response.json();
                detail = body.detail || detail;
            } catch {
                // Keep the HTTP status text when the server did not return JSON.
            }
            throw new Error(detail);
        }

        return response.status === 204 ? null : response.json();
    }

    function getCachedValue(key) {
        const raw = localStorage.getItem(key);
        if (raw === null) {
            return undefined;
        }
        try {
            return JSON.parse(raw);
        } catch {
            if (key === "foodHubRestaurantLogo") {
                return raw;
            }
            return undefined;
        }
    }

    function setCachedValue(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function clear() {
        accessToken = "";
    }

    function setAccessToken(token) {
        accessToken = token;
    }

    async function save(key, value) {
        if (!accessToken || !dataKeys.includes(key)) {
            return;
        }

        const ownerId = localStorage.getItem(ownerKey);
        const previous = saveQueues.get(key) || Promise.resolve();
        const task = previous.catch(() => {}).then(() => {
            if (!accessToken || localStorage.getItem(ownerKey) !== ownerId) {
                return;
            }

            return request(`/data/${encodeURIComponent(key)}`, accessToken, {
                method: "PUT",
                body: JSON.stringify(value)
            });
        });
        saveQueues.set(key, task);

        try {
            await task;
        } catch (error) {
            showSyncError(`Could not sync ${key}: ${error.message}`);
        } finally {
            if (saveQueues.get(key) === task) {
                saveQueues.delete(key);
            }
        }
    }

    async function load(userId, token, isCurrent = () => true) {
        const remoteData = await request("/data", token);
        if (!isCurrent()) {
            return false;
        }
        if (!remoteData || typeof remoteData !== "object" || Array.isArray(remoteData)) {
            throw new Error("The backend returned an invalid POS data response.");
        }

        const previousOwner = localStorage.getItem(ownerKey);
        const mayMigrateLegacyData = !previousOwner;
        if (previousOwner && previousOwner !== userId) {
            dataKeys.forEach(key => localStorage.removeItem(key));
        }
        localStorage.setItem(ownerKey, userId);

        for (const key of dataKeys) {
            if (!isCurrent()) {
                return false;
            }

            if (Object.prototype.hasOwnProperty.call(remoteData, key)) {
                setCachedValue(key, remoteData[key]);
                continue;
            }

            const cachedValue = getCachedValue(key);
            if (cachedValue !== undefined && (mayMigrateLegacyData || previousOwner === userId)) {
                setCachedValue(key, cachedValue);
                await request(`/data/${encodeURIComponent(key)}`, token, {
                    method: "PUT",
                    body: JSON.stringify(cachedValue)
                });
            }
        }

        if (!isCurrent()) {
            return false;
        }

        return true;
    }

    window.posBackend = { clear, load, save, setAccessToken };
})();
