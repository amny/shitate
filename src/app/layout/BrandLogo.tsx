const ICON_SRC = `${import.meta.env.BASE_URL}favicon.svg`;

export function BrandLogo() {
  return (
    <span className="app-brand">
      <img className="app-brand-icon" src={ICON_SRC} alt="" width={26} height={26} />
      <span className="app-brand-name">Shitate</span>
    </span>
  );
}
