import { TestBed } from '@angular/core/testing';

import { ComptaOfficeService } from './compta-office.service';

describe('ComptaOfficeService', () => {
  let service: ComptaOfficeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ComptaOfficeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
