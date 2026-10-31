-- Warna sekunder per bisnis: aksen/highlight di samping warna primer.
ALTER TABLE `BusinessTheme`
    ADD COLUMN `secondaryColor` VARCHAR(7) NOT NULL DEFAULT '#f2a93b';
