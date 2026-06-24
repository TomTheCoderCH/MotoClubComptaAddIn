// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tooltip from '../../components/Tooltip';

describe('Tooltip', () => {
  it('affiche l\'icône ? avec aria-label="Aide"', () => {
    render(<Tooltip content="aide" />);
    expect(screen.getByRole('img', { name: 'Aide' })).toBeInTheDocument();
  });

  it('rend le contenu accessible via role="tooltip"', () => {
    render(<Tooltip content="Actif — Débit ↑ augmente" />);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Actif — Débit ↑ augmente');
  });

  it('accepte du JSX comme contenu', () => {
    render(<Tooltip content={<strong>Important</strong>} />);
    expect(screen.getByText('Important')).toBeInTheDocument();
  });
});
