const authScreen = document.getElementById("authScreen");
const authMessage = document.getElementById("authMessage");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const signInForm = document.getElementById("signInForm");
const signUpForm = document.getElementById("signUpForm");
const resendConfirmationButton = document.getElementById("resendConfirmationButton");
let supabaseClient;

function setAuthMessage(message, type = "") {
    authMessage.textContent = message;
    authMessage.className = `auth-message${type ? ` ${type}` : ""}`;
    resendConfirmationButton.classList.add("hidden");
}

function showAuthForm(formName) {
    const isSignIn = formName === "signIn";

    signInForm.classList.toggle("hidden", !isSignIn);
    signUpForm.classList.toggle("hidden", isSignIn);
    document.getElementById("signInTab").classList.toggle("active", isSignIn);
    document.getElementById("signUpTab").classList.toggle("active", !isSignIn);
    document.getElementById("signInTab").setAttribute("aria-selected", String(isSignIn));
    document.getElementById("signUpTab").setAttribute("aria-selected", String(!isSignIn));
    authTitle.textContent = isSignIn ? "Welcome back" : "Create your account";
    authSubtitle.textContent = isSignIn
        ? "Sign in to continue to your restaurant POS."
        : "Sign up to get started with your restaurant POS.";
    setAuthMessage("");
}

function setAuthenticatedUser(user) {
    const name = user.user_metadata?.full_name || user.email || "POS User";
    const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

    writeStoredData("foodHubActiveAccount", {
        name,
        role: "Staff",
        initials
    });
    updateVisibleAccount();
    document.body.classList.add("is-authenticated");
    authScreen.setAttribute("aria-hidden", "true");
}

function showSignIn(message = "") {
    document.body.classList.remove("is-authenticated");
    authScreen.setAttribute("aria-hidden", "false");
    showAuthForm("signIn");
    setAuthMessage(message);
}

function requireSupabaseClient() {
    if (supabaseClient) {
        return true;
    }

    const config = window.SUPABASE_CONFIG;
    const message = !window.supabase?.createClient
        ? "The Supabase Auth library could not load. Check your internet connection and reload the page."
        : !config?.url || !config?.anonKey
            ? "Authentication is not configured. Add your Supabase project URL and public anon key to supabase-config.js."
            : "Supabase Auth could not be initialized. Check the project URL and public anon key.";
    setAuthMessage(message, "error");
    return false;
}

signInForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!requireSupabaseClient()) {
        return;
    }

    const submitButton = signInForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setAuthMessage("Signing in...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: signInForm.elements.email.value.trim(),
        password: signInForm.elements.password.value
    });

    submitButton.disabled = false;

    if (error) {
        if (error.code === "email_not_confirmed" || error.message.toLowerCase().includes("email not confirmed")) {
            setAuthMessage("Your email address has not been confirmed. Check your inbox and spam folder, or resend the confirmation email.", "error");
            resendConfirmationButton.classList.remove("hidden");
        } else {
            setAuthMessage(error.message, "error");
        }
        return;
    }

    setAuthenticatedUser(data.user);
});

resendConfirmationButton.addEventListener("click", async () => {
    if (!requireSupabaseClient()) {
        return;
    }

    const email = signInForm.elements.email.value.trim();
    if (!email) {
        setAuthMessage("Enter your email address above, then try again.", "error");
        signInForm.elements.email.focus();
        return;
    }

    resendConfirmationButton.disabled = true;
    setAuthMessage("Sending confirmation email...");

    const { error } = await supabaseClient.auth.resend({
        type: "signup",
        email
    });

    resendConfirmationButton.disabled = false;

    if (error) {
        setAuthMessage(error.message, "error");
        return;
    }

    setAuthMessage("If this email needs confirmation, a new confirmation link has been sent. Check your inbox and spam folder.", "success");
});

signUpForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!requireSupabaseClient()) {
        return;
    }

    const name = signUpForm.elements.name.value.trim();
    const password = signUpForm.elements.password.value;
    const passwordConfirm = signUpForm.elements.passwordConfirm.value;

    if (password !== passwordConfirm) {
        setAuthMessage("The passwords do not match.", "error");
        signUpForm.elements.passwordConfirm.focus();
        return;
    }

    const submitButton = signUpForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setAuthMessage("Creating your account...");

    const { data, error } = await supabaseClient.auth.signUp({
        email: signUpForm.elements.email.value.trim(),
        password,
        options: {
            data: {
                full_name: name
            }
        }
    });

    submitButton.disabled = false;

    if (error) {
        setAuthMessage(error.message, "error");
        return;
    }

    if (data.session && data.user) {
        setAuthenticatedUser(data.user);
        return;
    }

    signUpForm.reset();
    showAuthForm("signIn");
    setAuthMessage("Account created. Check your email to confirm your account, then sign in.", "success");
});

async function signOut() {
    if (!requireSupabaseClient()) {
        return;
    }

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        document.querySelector(".account-switcher-help").textContent = `Unable to sign out: ${error.message}`;
        return;
    }

    closeAccountSwitcher();
    showSignIn("You have been signed out.", "success");
}

function initializeSupabaseAuth() {
    const config = window.SUPABASE_CONFIG;

    if (!window.supabase?.createClient || !config?.url || !config?.anonKey) {
        showSignIn("Add your Supabase project URL and public anon key to supabase-config.js to enable sign in.");
        return;
    }

    try {
        supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    } catch (error) {
        setAuthMessage(`Supabase Auth could not be initialized: ${error.message}`, "error");
        return;
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            setAuthenticatedUser(session.user);
        } else {
            showSignIn();
        }
    });
}

initializeSupabaseAuth();
