
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import WalletList from "@/components/Wallet/WalletList";
import userEvent from "@testing-library/user-event";
import { parseMarkdown } from "@/lib/parseMarkdown";

jest.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ t: {} }),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

const wallets = parseMarkdown(`
## [Alive](https://alive.example)
- Devices: Mobile
- Pools: Orchard | Ironwood
- NU7: Compatible
- Stage: Beta

---
## [Gone](https://gone.example)
- Devices: Desktop
- Pools: Orchard
- Status: Deprecated | End-of-life, no NU6.3 support
`);

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({}),
  })) as any;
});

describe("WalletList", () => {
  it("lists deprecated wallets separately", () => {
    render(<WalletList allWallets={wallets} />);

    expect(screen.getAllByText("1 wallet").length).toBeGreaterThan(0);

    const section = screen
      .getByText(/Deprecated \/ no longer supports Zcash \(1\)/)
      .closest("details") as HTMLElement;

    expect(section).toHaveAttribute("open");
    expect(within(section).getByText("Gone")).toBeInTheDocument();
    expect(
      within(section).getByText("End-of-life, no NU6.3 support")
    ).toBeInTheDocument();

    expect(
      within(section).queryByText("Alive")
    ).not.toBeInTheDocument();

    expect(
      within(section).queryByText(/^NU7:/)
    ).not.toBeInTheDocument();
  });

  it("applies filters to deprecated wallets too", async () => {
    const user = userEvent.setup();

    render(<WalletList allWallets={wallets} />);

    const sidebar = document.querySelector(".wl-sidebar") as HTMLElement;

    const orchard = await within(sidebar).findByRole("checkbox", {
      name: "Orchard",
    });

    await user.click(orchard);

    expect(
      screen.getByText(/Deprecated \/ no longer supports Zcash \(1\)/)
    ).toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole("checkbox", { name: "Mobile" })
    );

    expect(
      screen.queryByText(/Deprecated \/ no longer supports Zcash/)
    ).not.toBeInTheDocument();

    expect(screen.queryByText("Gone")).not.toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole("checkbox", { name: "Mobile" })
    );
    await user.click(orchard);

    expect(
      screen.getByText(/Deprecated \/ no longer supports Zcash \(1\)/)
    ).toBeInTheDocument();
  });

  it("builds filters from active wallets only", async () => {
    render(<WalletList allWallets={wallets} />);

    await waitFor(() =>
      expect(screen.getAllByText("Mobile").length).toBeGreaterThan(1)
    );

    const sidebar = document.querySelector(".wl-sidebar") as HTMLElement;

    expect(
      within(sidebar).getByText("Mobile")
    ).toBeInTheDocument();

    expect(
      within(sidebar).queryByText("Desktop")
    ).not.toBeInTheDocument();
  });

  it("shows NU7 compatibility and the release stage", () => {
    render(<WalletList allWallets={wallets} />);

    expect(
      screen.getByText("NU7: Compatible")
    ).toBeInTheDocument();

    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("orders wallets by NU7 compatibility", () => {
    const list = parseMarkdown(`
## [NoStatus](https://a.example)
- Devices: Mobile

---
## [Late](https://b.example)
- Devices: Mobile
- NU7: Not Ready

---
## [Transp](https://c.example)
- Devices: Mobile
- NU7: Compatible for Transparent ZEC

---
## [Early](https://d.example)
- Devices: Mobile
- NU7: Compatible

---
## [Busy](https://e.example)
- Devices: Mobile
- NU7: In Progress

---
## [Unverified](https://f.example)
- Devices: Mobile
- NU7: Not Verified
`);

    render(<WalletList allWallets={list} />);

    const titles = screen
      .getAllByRole("heading", { level: 5 })
      .map((h) => h.textContent);

    expect(titles).toEqual([
      "Early",
      "Transp",
      "Busy",
      "Late",
      "Unverified",
      "NoStatus",
    ]);
  });

  it("filters by NU7 status", async () => {
    const user = userEvent.setup();

    render(<WalletList allWallets={wallets} />);

    const sidebar = document.querySelector(".wl-sidebar") as HTMLElement;

    const compatible = await within(sidebar).findByRole("checkbox", {
      name: "Compatible",
    });

    await user.click(compatible);

    expect(screen.getByText("Alive")).toBeInTheDocument();
    expect(screen.queryByText("Gone")).not.toBeInTheDocument();
  });

  describe("sections", () => {
    const sectioned = parseMarkdown(`
## [Shielded](https://s.example)
- Devices: Mobile
- Pools: Transparent | Sapling | Ironwood

---
## [Hardware](https://h.example)
- Devices: Hardware
- Pools: Transparent | Ironwood

---
## [StageBeta](https://sb.example)
- Devices: Desktop
- Pools: Transparent | Ironwood
- Stage: Beta

---
## [StatusBeta](https://st.example)
- Devices: Mobile
- Pools: Transparent | Sapling
- Status: Beta

---
## [TOnly](https://t.example)
- Devices: Mobile
- Pools: Transparent

---
## [Gone](https://gone.example)
- Devices: Desktop
- Pools: Transparent
- Status: Deprecated | End-of-life
`);

    const sectionOf = (name: string) =>
      screen
        .getByRole("heading", { level: 5, name })
        .closest("section[data-section]")!
        .getAttribute("data-section");

    it("puts Beta below in-production and Transparent-only below Beta", () => {
      render(<WalletList allWallets={sectioned} />);

      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent);

      expect(headings).toEqual([
        "In production (2)",
        "Beta wallets (2)",
        "Transparent-only wallets (1)",
      ]);

      expect(sectionOf("Shielded")).toBe("production");
      // Transparent plus a shielded pool is not transparent-only.
      expect(sectionOf("Hardware")).toBe("production");
      expect(sectionOf("StageBeta")).toBe("beta");
      expect(sectionOf("StatusBeta")).toBe("beta");
      expect(sectionOf("TOnly")).toBe("transparent-only");

      // Deprecated wallets stay in their own block, last.
      const deprecated = screen
        .getByText(/Deprecated \/ no longer supports Zcash \(1\)/)
        .closest("details") as HTMLElement;
      const transparentSection = screen
        .getByText("TOnly")
        .closest("section[data-section]") as HTMLElement;

      expect(
        transparentSection.compareDocumentPosition(deprecated) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();

      // The total count covers every active section.
      expect(screen.getAllByText("5 wallets").length).toBeGreaterThan(0);
    });

    it("shows each section's subtitle", () => {
      render(<WalletList allWallets={sectioned} />);

      expect(
        screen.getByText("Released wallets for everyday use.")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Still in testing/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/cannot use shielded pools/)
      ).toBeInTheDocument();
    });

    it("treats `Status: Beta` as the Beta stage", () => {
      const [wallet] = parseMarkdown(`
## [StatusBeta](https://st.example)
- Pools: Transparent
- Status: Beta
`);

      expect(wallet.stage).toBe("Beta");
    });

    it("collapses and expands the Beta and Transparent-only sections", async () => {
      const user = userEvent.setup();

      render(<WalletList allWallets={sectioned} />);

      // In production is always open, so it has no toggle.
      expect(
        screen.queryByRole("button", { name: /In production/ })
      ).not.toBeInTheDocument();

      const beta = screen.getByRole("button", { name: "Beta wallets (2)" });
      const transparent = screen.getByRole("button", {
        name: "Transparent-only wallets (1)",
      });

      expect(beta).toHaveAttribute("aria-expanded", "true");
      expect(transparent).toHaveAttribute("aria-expanded", "true");

      await user.click(beta);

      expect(beta).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("heading", { level: 5, name: "StageBeta" })
      ).not.toBeInTheDocument();
      // The other sections are unaffected.
      expect(
        screen.getByRole("heading", { level: 5, name: "TOnly" })
      ).toBeInTheDocument();
      // The subtitle stays visible while collapsed.
      expect(screen.getByText(/Still in testing/)).toBeVisible();

      await user.click(beta);

      expect(beta).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("heading", { level: 5, name: "StageBeta" })
      ).toBeInTheDocument();

      await user.click(transparent);

      expect(transparent).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("heading", { level: 5, name: "TOnly" })
      ).not.toBeInTheDocument();
    });

    it("hides a section when filters leave it empty", async () => {
      const user = userEvent.setup();

      render(<WalletList allWallets={sectioned} />);

      const sidebar = document.querySelector(".wl-sidebar") as HTMLElement;

      await user.click(
        await within(sidebar).findByRole("checkbox", { name: "Sapling" })
      );

      expect(
        screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
      ).toEqual(["In production (1)", "Beta wallets (1)"]);
      expect(screen.queryByText("TOnly")).not.toBeInTheDocument();
    });
  });
});
