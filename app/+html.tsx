import { ScrollViewStyleReset } from 'expo-router/html';
import { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Split shared expenses and settle balances with your group." />
        <title>SplitPatel</title>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
