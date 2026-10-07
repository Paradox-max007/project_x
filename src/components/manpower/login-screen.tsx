"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  ChevronDown,
  CircleAlert,
  Eye,
  EyeOff,
  HardHat,
  Loader2,
  LogIn,
  MapPin,
  ShieldCheck,
  Shirt,
  Sparkles,
  Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiPost } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import type { AuthUser } from "@/types/manpower";

type LoginForm = {
  email: string;
  password: string;
};

const DEMO_ACCOUNTS: {
  label: string;
  email: string;
  password: string;
  desc: string;
}[] = [
  {
    label: "Super Admin",
    email: "superadmin@asm.com",
    password: "SuperAdmin@123",
    desc: "Full access to every module",
  },
  {
    label: "HR Admin",
    email: "hr.admin@asm.com",
    password: "Admin@123",
    desc: "Employees, attendance, leave, warnings & fines",
  },
  {
    label: "Ops Admin",
    email: "ops.admin@asm.com",
    password: "Admin@123",
    desc: "Sites, attendance, employees & cancellations",
  },
];

const FEATURES = [
  {
    icon: Users,
    title: "Employee registry",
    desc: "Full workforce records, ratings & site history",
  },
  {
    icon: CalendarCheck,
    title: "Daily attendance",
    desc: "Mark, review and analyse attendance in seconds",
  },
  {
    icon: MapPin,
    title: "Site management",
    desc: "Assign workers, track team leaders & utilisation",
  },
  {
    icon: Shirt,
    title: "Uniform registry",
    desc: "Issued uniforms, tokens & renewal tracking",
  },
];

export function LoginScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const res = await apiPost<{ user: AuthUser }>("/api/auth/login", {
        email: values.email.trim(),
        password: values.password,
      });
      // page.tsx reacts to the store and renders the AppShell automatically.
      setUser(res.user);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in right now.";
      if (/too many|rate limit|429/i.test(message)) {
        setServerError(
          "Too many sign-in attempts. Please wait a moment and try again."
        );
      } else {
        setServerError(message);
      }
    }
  };

  const fillDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setValue("email", account.email, { shouldValidate: true });
    setValue("password", account.password, { shouldValidate: true });
    setServerError(null);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* ------------------------------------------------ Brand panel */}
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* decorative emerald glows + grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(600px circle at 15% 20%, rgba(16,185,129,0.16), transparent 55%), radial-gradient(700px circle at 85% 85%, rgba(20,184,166,0.10), transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-zinc-950 shadow-lg shadow-emerald-500/25">
              <HardHat className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-white">
                ASM Manpower
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-400/90">
                Manpower Solutions
              </p>
            </div>
          </div>

          <h1 className="mt-14 max-w-md text-4xl font-bold leading-tight tracking-tight text-white xl:text-[2.75rem]">
            Manpower Management System
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-zinc-400">
            One workspace for your entire workforce — employees, sites,
            attendance, uniforms and compliance, all in real time.
          </p>
        </motion.div>

        <motion.ul
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.09 } },
          }}
          className="relative grid gap-4 sm:grid-cols-2"
        >
          {FEATURES.map((feature) => (
            <motion.li
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <feature.icon className="h-[18px] w-[18px]" />
              </div>
              <p className="mt-3 text-sm font-semibold text-white">
                {feature.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {feature.desc}
              </p>
            </motion.li>
          ))}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="relative flex items-center gap-2 text-xs text-zinc-500"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/80" />
          Session-secured access · every action is audit-logged
        </motion.div>
      </div>

      {/* ------------------------------------------------ Login form */}
      <div className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-[26rem]"
        >
          {/* compact brand for mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/25">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight">
                ASM Manpower
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                Manpower Solutions
              </p>
            </div>
          </div>

          <Card className="border-border/70 shadow-lg shadow-black/[0.04] dark:shadow-black/20">
            <CardHeader>
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>
                Sign in to your ASM Manpower workspace to continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                {serverError && (
                  <Alert variant="destructive" className="items-start">
                    <CircleAlert className="h-4 w-4 translate-y-0.5" />
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@asm.com"
                    aria-invalid={!!errors.email}
                    className="h-11"
                    {...register("email", {
                      required: "Email is required",
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: "Enter a valid email address",
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="text-xs font-medium text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      aria-invalid={!!errors.password}
                      className="h-11 pr-11"
                      {...register("password", {
                        required: "Password is required",
                        minLength: {
                          value: 6,
                          message: "Password must be at least 6 characters",
                        },
                      })}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs font-medium text-destructive">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 w-full text-[15px] font-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Sign in
                    </>
                  )}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <Separator className="flex-1" />
              </div>

              {/* --------------------------- demo accounts */}
              <Collapsible open={demoOpen} onOpenChange={setDemoOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Demo accounts
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                        demoOpen ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.06]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {account.label}
                          </span>
                          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {account.email}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {account.desc}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 opacity-80 transition-opacity group-hover:opacity-100 dark:text-emerald-400">
                        Fill
                      </span>
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} ASM Manpower Solutions — Manpower
            Management System
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default LoginScreen;
