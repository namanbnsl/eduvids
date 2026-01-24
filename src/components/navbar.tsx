"use client";

import { Github, Youtube, Twitter } from "lucide-react";

import Link from "next/link";
import Image from "next/image";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  return (
    <div className="flex justify-between items-center px-6 py-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
      <Link href={"/"}>
        <div className="flex items-center gap-1 min-w-0">
          <Image src="/favicon.png" alt="eduvids logo" width={36} height={36} />
          <span className="font-semibold text-foreground truncate text-md">
            eduvids
          </span>
        </div>
      </Link>

      <div className="flex gap-2 items-center">
        <div className="mr-2 ">
          <SignUpButton>
            <Button className="cursor-pointer">
              Sign Up For Advanced Features
            </Button>
          </SignUpButton>
        </div>
        <Link
          target="_blank"
          href="https://www.youtube.com/@eduvids-ai"
          aria-label="YouTube"
        >
          <button className="p-2 rounded-lg text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
            <Youtube className="size-5" />
          </button>
        </Link>
        <Link target="_blank" href="https://www.x.com/eduvidsai" aria-label="X">
          <button className="p-2 rounded-lg text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
            <Twitter className="size-5" />
          </button>
        </Link>
        <Link
          target="_blank"
          href="https://github.com/namanbnsl/eduvids"
          aria-label="GitHub"
        >
          <button className="p-2 rounded-lg text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
            <Github className="size-5" />
          </button>
        </Link>
        <div className="w-px h-6 bg-border/30" />
      </div>
    </div>
  );
};

export default Navbar;
