import { render, screen } from '@testing-library/react';
import App from './App';

test('renders operator login', () => {
  render(<App />);
  expect(screen.getByText(/OPERATOR LOGIN/i)).toBeInTheDocument();
});
