import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createAuthController } from "@/lib/dependencies/server";
import {
  isEmailConfirmationType,
  type EmailConfirmation,
} from "@/models/auth/auth.model";

function readConfirmation(params: URLSearchParams): EmailConfirmation | null {
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (tokenHash && type && isEmailConfirmationType(type)) {
    return { tokenHash, type };
  }

  return code ? { code } : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const controller = await createAuthController();
  const destination = await controller.confirmEmail(
    readConfirmation(params),
    params.get("next"),
  );

  redirect(destination);
}
